import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestOrg,
  createTestLearner,
  createTestQualification,
  resetFixtureCounter,
  enrollLearnerInQualification,
} from "@/test/fixtures";
import {
  studySessions,
  blockAttempts,
  studyBlocks,
  studyPlans,
  reviewQueue,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type {
  StudyBlock,
  SessionId,
  BlockId,
  LearnerId,
  TopicId,
  RetrievalResult,
  ChunkId,
} from "@/lib/types";
import type { LearnerContext } from "@/ai/study-modes";
import {
  configureSessionRunner,
  resetSessionRunner,
  startSession,
  continueSession,
  endSession,
  SessionConflictError,
  type SessionRunnerDeps,
} from "./session";
import { initTopicStates } from "./mastery";

const db = getTestDb();

function mockAnthropicResponse(text: string) {
  return {
    id: "msg_test",
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    model: "claude-sonnet-4-20250514",
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function createMockAnthropicClient(responses: string[]) {
  let callIndex = 0;
  return {
    messages: {
      create: vi.fn().mockImplementation(() => {
        const text = responses[callIndex] ?? responses[responses.length - 1];
        callIndex++;
        return Promise.resolve(mockAnthropicResponse(text));
      }),
    },
  };
}

function createMockRetrieveChunks(
  chunks: RetrievalResult[] = []
): SessionRunnerDeps["retrieveChunks"] {
  return vi.fn().mockResolvedValue(chunks);
}

function makeBlock(
  learnerId: string,
  topicId: string,
  blockId: string,
  overrides?: Partial<StudyBlock>
): StudyBlock {
  return {
    id: blockId as BlockId,
    learnerId: learnerId as LearnerId,
    topicId: topicId as TopicId,
    topicName: "Cell Biology",
    blockType: "retrieval_drill",
    durationMinutes: 15,
    priority: 3,
    reason: "Scheduled review",
    ...overrides,
  };
}

function makeLearnerContext(
  overrides?: Partial<LearnerContext>
): LearnerContext {
  return {
    masteryLevel: 0.65,
    knownMisconceptions: [],
    confirmedMemory: [],
    preferences: {},
    policies: [],
    ...overrides,
  };
}

function makeChunks(count = 2): RetrievalResult[] {
  return Array.from({ length: count }, (_, i) => ({
    chunkId: `chunk-${i}` as ChunkId,
    content: `Source content chunk ${i}`,
    score: 0.9,
    topicId: "topic-1" as TopicId,
    sourceFileName: `notes-${i}.pdf`,
    sourceFileId: `file-${i}`,
  }));
}

async function createBlockInDb(
  learnerId: string,
  topicId: string
): Promise<string> {
  const [plan] = await db
    .insert(studyPlans)
    .values({
      learnerId,
      planType: "weekly",
      startDate: "2026-03-16",
      endDate: "2026-03-22",
      status: "active",
    })
    .returning();

  const [block] = await db
    .insert(studyBlocks)
    .values({
      planId: plan.id,
      learnerId,
      topicId,
      blockType: "retrieval_drill",
      durationMinutes: 15,
      priority: 3,
      status: "pending",
    })
    .returning();

  return block.id;
}

async function createStartedSession(initialMessage = "Welcome!") {
  const org = await createTestOrg();
  const learner = await createTestLearner(org.id);
  const qual = await createTestQualification();
  const topicId = qual.topics[1].id;
  const blockId = await createBlockInDb(learner.id, topicId);

  configureSessionRunner({
    db,
    anthropic: createMockAnthropicClient([initialMessage]) as unknown as SessionRunnerDeps["anthropic"],
    retrieveChunks: createMockRetrieveChunks(),
  });

  const block = makeBlock(learner.id, topicId, blockId);
  const started = await startSession(block, makeLearnerContext());

  return {
    learner,
    topicId,
    blockId,
    sessionId: started.sessionId,
    systemPrompt: started.systemPrompt,
    initialMessage: started.initialMessage,
  };
}

beforeEach(async () => {
  resetFixtureCounter();
});

describe("startSession", () => {
  it("creates a session and returns initial message", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const mockAnthropicClient = createMockAnthropicClient([
      "Welcome to your retrieval drill on Cell Biology! Let's test your recall. Question 1: What is the function of mitochondria?",
    ]);
    const mockChunks = makeChunks();
    const mockRetrieveChunks = createMockRetrieveChunks(mockChunks);

    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: mockRetrieveChunks,
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const context = makeLearnerContext();

    const result = await startSession(block, context);

    expect(result.sessionId).toBeTruthy();
    expect(result.systemPrompt).toContain("Swotta");
    expect(result.systemPrompt).toContain("Retrieval Drill");
    expect(result.initialMessage).toContain("retrieval drill");
    expect(result.sourceChunks).toHaveLength(2);

    expect(mockRetrieveChunks).toHaveBeenCalledWith(
      learner.id,
      "Cell Biology",
      expect.objectContaining({ topicIds: [topicId], limit: 5 })
    );

    expect(mockAnthropicClient.messages.create).toHaveBeenCalledTimes(1);
    const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
    expect(callArgs.system).toContain("Swotta");
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe("user");
  });

  it("creates study_session record in DB", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const mockAnthropicClient = createMockAnthropicClient(["Hello!"]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const result = await startSession(block, makeLearnerContext());

    const sessions = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.id, result.sessionId));

    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("active");
    expect(sessions[0].learnerId).toBe(learner.id);
    expect(sessions[0].blockId).toBe(blockId);
  });

  it("creates block_attempt record in DB", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const mockAnthropicClient = createMockAnthropicClient(["Hello!"]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const result = await startSession(block, makeLearnerContext());

    const attempts = await db
      .select()
      .from(blockAttempts)
      .where(eq(blockAttempts.blockId, blockId));

    expect(attempts).toHaveLength(1);
    expect(attempts[0].completedAt).toBeNull();
    expect(attempts[0].rawInteraction).toEqual({
      sessionId: result.sessionId,
      systemPrompt: result.systemPrompt,
      messages: [
        {
          role: "assistant",
          content: result.initialMessage,
        },
      ],
    });
  });

  it("sets block status to active", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const mockAnthropicClient = createMockAnthropicClient(["Hello!"]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    await startSession(block, makeLearnerContext());

    const blocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.id, blockId));

    expect(blocks[0].status).toBe("active");
  });

  it("includes source chunks in the system prompt", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const chunks = makeChunks(2);
    const mockAnthropicClient = createMockAnthropicClient(["Hello!"]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(chunks),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const result = await startSession(block, makeLearnerContext());

    expect(result.systemPrompt).toContain("notes-0.pdf");
    expect(result.systemPrompt).toContain("notes-1.pdf");
    expect(result.systemPrompt).toContain("Source content chunk 0");
  });

  it("works with different block types", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;

    const [plan] = await db
      .insert(studyPlans)
      .values({
        learnerId: learner.id,
        planType: "weekly",
        startDate: "2026-03-16",
        endDate: "2026-03-22",
        status: "active",
      })
      .returning();

    const [block] = await db
      .insert(studyBlocks)
      .values({
        planId: plan.id,
        learnerId: learner.id,
        topicId,
        blockType: "explanation",
        durationMinutes: 20,
        priority: 2,
        status: "pending",
      })
      .returning();

    const mockAnthropicClient = createMockAnthropicClient([
      "Let me explain this concept...",
    ]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const studyBlock = makeBlock(learner.id, topicId, block.id, {
      blockType: "explanation",
      durationMinutes: 20,
    });
    const result = await startSession(studyBlock, makeLearnerContext());

    expect(result.systemPrompt).toContain("Explanation");
  });

  it("propagates error when Claude API throws", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const mockAnthropicClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("API rate limit exceeded")),
      },
    };
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    await expect(startSession(block, makeLearnerContext())).rejects.toThrow(
      "API rate limit exceeded"
    );
  });

  it("propagates error when retrieveChunks throws", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const mockAnthropicClient = createMockAnthropicClient(["Hello!"]);
    const failingRetrieveChunks = vi
      .fn()
      .mockRejectedValue(new Error("Ingestion service unavailable"));

    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: failingRetrieveChunks,
    });

    const block = makeBlock(learner.id, topicId, blockId);
    await expect(startSession(block, makeLearnerContext())).rejects.toThrow(
      "Ingestion service unavailable"
    );
  });
});

describe("continueSession", () => {
  it("returns Claude's response", async () => {
    const started = await createStartedSession(
      "What is the function of mitochondria?"
    );
    const mockAnthropicClient = createMockAnthropicClient([
      "Correct! Mitochondria are the powerhouse of the cell. Question 2: What is osmosis?",
    ]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await continueSession(
      started.sessionId,
      [
        {
          role: "assistant",
          content: started.initialMessage,
        },
        {
          role: "user",
          content: "They produce energy for the cell through respiration.",
        },
      ],
      "System prompt here"
    );

    expect(result.reply).toContain("Correct");
    expect(result.reply).toContain("osmosis");
    expect(result.isComplete).toBe(false);
  });

  it("detects session completion", async () => {
    const started = await createStartedSession(
      "Last question: What is diffusion?"
    );
    const mockAnthropicClient = createMockAnthropicClient([
      "Excellent work! You scored 4/5. <session_status>complete</session_status>",
    ]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await continueSession(
      started.sessionId,
      [
        { role: "assistant", content: started.initialMessage },
        {
          role: "user",
          content: "The movement of particles from high to low concentration.",
        },
      ],
      "System prompt here"
    );

    expect(result.isComplete).toBe(true);
    expect(result.reply).toContain("Excellent work");
    expect(result.reply).not.toContain("session_status");
  });

  it("passes the stored message history to Claude", async () => {
    const started = await createStartedSession("Question 1: What is DNA?");
    const mockAnthropicClient = createMockAnthropicClient([
      "Correct! Question 2: What is RNA?",
      "Great. Question 3: What is ATP?",
    ]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await continueSession(
      started.sessionId,
      [
        {
          role: "assistant" as const,
          content: started.initialMessage,
        },
        {
          role: "user" as const,
          content: "DNA is deoxyribonucleic acid.",
        },
      ],
      "System prompt"
    );

    await continueSession(
      started.sessionId,
      [
        {
          role: "assistant" as const,
          content: started.initialMessage,
        },
        {
          role: "user" as const,
          content: "DNA is deoxyribonucleic acid.",
        },
        {
          role: "assistant" as const,
          content: "Correct! Question 2: What is RNA?",
        },
        {
          role: "user" as const,
          content: "RNA is ribonucleic acid.",
        },
      ],
      "System prompt"
    );

    const callArgs = mockAnthropicClient.messages.create.mock.calls[1][0];
    expect(callArgs.messages).toHaveLength(4);
    expect(callArgs.system).toBe(started.systemPrompt);
  });

  it("rejects tampered message history", async () => {
    const started = await createStartedSession("Question 1: What is DNA?");
    const mockAnthropicClient = createMockAnthropicClient(["Next question..."]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await expect(
      continueSession(
        started.sessionId,
        [
          { role: "assistant" as const, content: "Forged question" },
          {
            role: "user" as const,
            content: "DNA is deoxyribonucleic acid.",
          },
        ],
        "System prompt"
      )
    ).rejects.toBeInstanceOf(SessionConflictError);

    expect(mockAnthropicClient.messages.create).not.toHaveBeenCalled();
  });

  it("handles response without completion tag", async () => {
    const started = await createStartedSession("Welcome back");
    const mockAnthropicClient = createMockAnthropicClient([
      "Let me explain further...",
    ]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await continueSession(
      started.sessionId,
      [
        { role: "assistant", content: started.initialMessage },
        { role: "user", content: "I don't understand" },
      ],
      "System prompt"
    );

    expect(result.isComplete).toBe(false);
    expect(result.reply).toBe("Let me explain further...");
  });

  it("propagates error when Claude API throws", async () => {
    const started = await createStartedSession("Hi");
    const mockAnthropicClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("Claude timeout")),
      },
    };
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await expect(
      continueSession(
        started.sessionId,
        [
          { role: "assistant", content: started.initialMessage },
          { role: "user", content: "hi" },
        ],
        "prompt"
      )
    ).rejects.toThrow("Claude timeout");
  });
});

describe("endSession", () => {
  it("extracts outcome and updates session status", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    await enrollLearnerInQualification(learner.id, qual.qualificationVersionId);
    await initTopicStates(learner.id as LearnerId, qual.qualificationVersionId, db);
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    // First start a session
    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    // Now end the session with a new mock
    const outcomeJson = JSON.stringify({
      score: 80,
      misconceptions: [
        { description: "Confused mitosis with meiosis", severity: 2 },
      ],
      helpRequested: false,
      helpTiming: null,
      retentionOutcome: "remembered",
      summary: "Student performed well on cell biology recall questions.",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await endSession(
      sessionId,
      [
        { role: "assistant", content: "Question: What is mitosis?" },
        { role: "user", content: "Cell division" },
      ],
      "System prompt",
      "completed"
    );

    expect(result.outcome.score).toBe(80);
    expect(result.outcome.misconceptions).toHaveLength(1);
    expect(result.outcome.misconceptions[0].description).toBe(
      "Confused mitosis with meiosis"
    );
    expect(result.outcome.helpRequested).toBe(false);
    expect(result.outcome.retentionOutcome).toBe("remembered");
    expect(result.summary).toContain("performed well");
    expect(result.masteryUpdated).toBe(true);

    // Check DB updates
    const sessions = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.id, sessionId));

    expect(sessions[0].status).toBe("completed");
    expect(sessions[0].endedAt).not.toBeNull();
    expect(sessions[0].summary).toContain("performed well");
    expect(sessions[0].totalDurationMinutes).toBeGreaterThanOrEqual(0);

    const queuedReviews = await db
      .select({
        topicId: reviewQueue.topicId,
        reason: reviewQueue.reason,
        fulfilledAt: reviewQueue.fulfilledAt,
      })
      .from(reviewQueue)
      .where(
        and(
          eq(reviewQueue.learnerId, learner.id),
          eq(reviewQueue.topicId, topicId),
          isNull(reviewQueue.fulfilledAt)
        )
      );

    expect(queuedReviews).toHaveLength(1);
    expect(queuedReviews[0].reason).toBe("scheduled");
  });

  it("updates block_attempt on session end", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const outcomeJson = JSON.stringify({
      score: 75,
      misconceptions: [],
      helpRequested: true,
      helpTiming: "after_attempt",
      retentionOutcome: "partial",
      summary: "Decent session.",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q1" },
        { role: "user", content: "A1" },
      ],
      "System prompt",
      "completed"
    );

    const attempts = await db
      .select()
      .from(blockAttempts)
      .where(eq(blockAttempts.blockId, blockId));

    expect(attempts).toHaveLength(1);
    expect(attempts[0].completedAt).not.toBeNull();
    expect(attempts[0].score).toBe("75.00");
    expect(attempts[0].helpRequested).toBe(true);
    expect(attempts[0].helpTiming).toBe("after_attempt");
    expect(attempts[0].misconceptionsDetected).toBe(0);
  });

  it("keeps repeated attempts on the same block separate", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const block = makeBlock(learner.id, topicId, blockId);

    configureSessionRunner({
      db,
      anthropic: createMockAnthropicClient(["Welcome back!"]) as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });
    const firstSession = await startSession(block, makeLearnerContext());

    configureSessionRunner({
      db,
      anthropic: createMockAnthropicClient([
        JSON.stringify({
          score: 65,
          misconceptions: [],
          helpRequested: false,
          helpTiming: null,
          retentionOutcome: "partial",
          summary: "First attempt complete.",
        }),
      ]) as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });
    await endSession(
      firstSession.sessionId,
      [
        { role: "assistant", content: "Q1" },
        { role: "user", content: "A1" },
      ],
      "SP",
      "completed",
      { before: 0.2, after: 0.5 }
    );

    configureSessionRunner({
      db,
      anthropic: createMockAnthropicClient(["Let's retry."]) as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });
    const secondSession = await startSession(block, makeLearnerContext());

    configureSessionRunner({
      db,
      anthropic: createMockAnthropicClient([
        JSON.stringify({
          score: 92,
          misconceptions: [],
          helpRequested: true,
          helpTiming: "after_attempt",
          retentionOutcome: "remembered",
          summary: "Second attempt complete.",
        }),
      ]) as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });
    await endSession(
      secondSession.sessionId,
      [
        { role: "assistant", content: "Q2" },
        { role: "user", content: "A2" },
      ],
      "SP",
      "completed",
      { before: 0.7, after: 0.9 }
    );

    const attempts = await db
      .select()
      .from(blockAttempts)
      .where(eq(blockAttempts.blockId, blockId));

    const sortedAttempts = attempts.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    expect(sortedAttempts).toHaveLength(2);
    expect(sortedAttempts[0].score).toBe("65.00");
    expect(sortedAttempts[0].confidenceBefore).toBe("0.200");
    expect(sortedAttempts[0].confidenceAfter).toBe("0.500");
    expect(sortedAttempts[1].score).toBe("92.00");
    expect(sortedAttempts[1].helpRequested).toBe(true);
    expect(sortedAttempts[1].confidenceBefore).toBe("0.700");
    expect(sortedAttempts[1].confidenceAfter).toBe("0.900");
  });

  it("sets block status to completed on successful end", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const outcomeJson = JSON.stringify({
      score: 90,
      misconceptions: [],
      helpRequested: false,
      helpTiming: null,
      retentionOutcome: "remembered",
      summary: "Great session!",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "completed"
    );

    const blocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.id, blockId));

    expect(blocks[0].status).toBe("completed");
  });

  it("sets block status to pending on abandoned session", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const outcomeJson = JSON.stringify({
      score: null,
      misconceptions: [],
      helpRequested: false,
      helpTiming: null,
      retentionOutcome: null,
      summary: "Session abandoned early.",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "I need to go" },
      ],
      "SP",
      "abandoned"
    );

    const blocks = await db
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.id, blockId));

    expect(blocks[0].status).toBe("pending");

    const sessions = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.id, sessionId));

    expect(sessions[0].status).toBe("abandoned");
  });

  it("handles timeout reason correctly", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const outcomeJson = JSON.stringify({
      score: 50,
      misconceptions: [],
      helpRequested: false,
      helpTiming: null,
      retentionOutcome: "partial",
      summary: "Session timed out.",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "timeout"
    );

    const sessions = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.id, sessionId));

    expect(sessions[0].status).toBe("timeout");
  });

  it("handles malformed JSON from Claude gracefully", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const endMock = createMockAnthropicClient([
      "I cannot produce valid JSON right now. Sorry!",
    ]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "completed"
    );

    expect(result.outcome.score).toBeNull();
    expect(result.outcome.misconceptions).toEqual([]);
    expect(result.summary).toContain("Unable to extract");
  });

  it("rejects ending a session twice", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    configureSessionRunner({
      db,
      anthropic: createMockAnthropicClient(["Welcome!"]) as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    configureSessionRunner({
      db,
      anthropic: createMockAnthropicClient([
        JSON.stringify({
          score: 88,
          misconceptions: [],
          helpRequested: false,
          helpTiming: null,
          retentionOutcome: "remembered",
          summary: "Complete.",
        }),
      ]) as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "completed"
    );

    await expect(
      endSession(
        sessionId,
        [
          { role: "assistant", content: "Q" },
          { role: "user", content: "A" },
        ],
        "SP",
        "completed"
      )
    ).rejects.toBeInstanceOf(SessionConflictError);
  });

  it("throws for non-existent session", async () => {
    const mockAnthropicClient = createMockAnthropicClient(["{}"]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await expect(
      endSession(
        "00000000-0000-0000-0000-000000000000" as SessionId,
        [],
        "SP",
        "completed"
      )
    ).rejects.toThrow("Session not found");
  });

  it("propagates error when Claude API throws during outcome extraction", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const failingMock = {
      messages: {
        create: vi
          .fn()
          .mockRejectedValue(new Error("Claude service unavailable")),
      },
    };
    configureSessionRunner({
      db,
      anthropic: failingMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    await expect(
      endSession(
        sessionId,
        [
          { role: "assistant", content: "Q" },
          { role: "user", content: "A" },
        ],
        "SP",
        "completed"
      )
    ).rejects.toThrow("Claude service unavailable");
  });

  it("handles JSON wrapped in markdown code fences", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const wrappedJson = `\`\`\`json
{
  "score": 85,
  "misconceptions": [],
  "helpRequested": false,
  "helpTiming": null,
  "retentionOutcome": "remembered",
  "summary": "Good session with markdown fences."
}
\`\`\``;

    const endMock = createMockAnthropicClient([wrappedJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "completed"
    );

    expect(result.outcome.score).toBe(85);
    expect(result.summary).toContain("markdown fences");
  });

  it("handles outcome with multiple misconceptions", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const outcomeJson = JSON.stringify({
      score: 40,
      misconceptions: [
        { description: "Confused osmosis with diffusion", severity: 2 },
        { description: "Thinks plant cells have no mitochondria", severity: 3 },
        { description: "Minor naming error", severity: 1 },
      ],
      helpRequested: true,
      helpTiming: "before_attempt",
      retentionOutcome: "forgotten",
      summary: "Several misconceptions identified.",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "completed"
    );

    expect(result.outcome.misconceptions).toHaveLength(3);
    expect(result.outcome.misconceptions[0].severity).toBe(2);
    expect(result.outcome.misconceptions[1].severity).toBe(3);
    expect(result.outcome.misconceptions[2].severity).toBe(1);
    expect(result.outcome.helpRequested).toBe(true);
    expect(result.outcome.helpTiming).toBe("before_attempt");
    expect(result.outcome.retentionOutcome).toBe("forgotten");
  });

  it("handles outcome with invalid severity values (defaults to 2)", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const outcomeJson = JSON.stringify({
      score: 60,
      misconceptions: [
        { description: "Bad severity", severity: 99 },
        { description: "String severity", severity: "high" },
      ],
      helpRequested: false,
      helpTiming: null,
      retentionOutcome: null,
      summary: "Test with invalid severities.",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "completed"
    );

    expect(result.outcome.misconceptions[0].severity).toBe(2);
    expect(result.outcome.misconceptions[1].severity).toBe(2);
  });

  it("handles outcome with misconceptions not being an array", async () => {
    const org = await createTestOrg();
    const learner = await createTestLearner(org.id);
    const qual = await createTestQualification();
    const topicId = qual.topics[1].id;
    const blockId = await createBlockInDb(learner.id, topicId);

    const startMock = createMockAnthropicClient(["Welcome!"]);
    configureSessionRunner({
      db,
      anthropic: startMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const block = makeBlock(learner.id, topicId, blockId);
    const { sessionId } = await startSession(block, makeLearnerContext());

    const outcomeJson = JSON.stringify({
      score: 70,
      misconceptions: "not an array",
      helpRequested: false,
      helpTiming: null,
      retentionOutcome: "remembered",
      summary: "Misconceptions field was invalid.",
    });

    const endMock = createMockAnthropicClient([outcomeJson]);
    configureSessionRunner({
      db,
      anthropic: endMock as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await endSession(
      sessionId,
      [
        { role: "assistant", content: "Q" },
        { role: "user", content: "A" },
      ],
      "SP",
      "completed"
    );

    expect(result.outcome.misconceptions).toEqual([]);
  });
});

describe("configureSessionRunner", () => {
  it("works after proper configuration", async () => {
    const started = await createStartedSession("hi");
    const mockAnthropicClient = createMockAnthropicClient(["test"]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });

    const result = await continueSession(
      started.sessionId,
      [
        { role: "assistant", content: started.initialMessage },
        { role: "user", content: "hi" },
      ],
      "prompt"
    );
    expect(result.reply).toBe("test");
  });

  it("throws when called before configuration", async () => {
    resetSessionRunner();

    await expect(
      continueSession(
        "s" as SessionId,
        [{ role: "user", content: "hi" }],
        "prompt"
      )
    ).rejects.toThrow("Session runner not configured");

    // Re-configure for any subsequent tests
    const mockAnthropicClient = createMockAnthropicClient(["ok"]);
    configureSessionRunner({
      db,
      anthropic: mockAnthropicClient as unknown as SessionRunnerDeps["anthropic"],
      retrieveChunks: createMockRetrieveChunks(),
    });
  });
});
