"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttemptOutcome, BlockType } from "@/lib/types";

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export type SessionPhase =
  | "loading"
  | "starting"
  | "recovery"
  | "confidence-before"
  | "active"
  | "streaming"
  | "completing"
  | "confidence-after"
  | "complete"
  | "error";

export interface SessionBlockInfo {
  id: string;
  topicName: string;
  blockType: BlockType;
  durationMinutes: number;
  reason: string;
}

export interface SessionResult {
  outcome: AttemptOutcome;
  summary: string;
}

export type SessionRecoveryReason =
  | "abandoned"
  | "timeout"
  | "transcript_missing";

interface SessionRecoveryFresh {
  mode: "fresh";
}

interface SessionRecoveryResume {
  mode: "resume";
  sessionId: string;
  startedAt: string;
  systemPrompt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  completionPending: boolean;
}

interface SessionRecoveryRestart {
  mode: "restart";
  sessionId: string | null;
  reason: SessionRecoveryReason;
  startedAt: string | null;
  endedAt: string | null;
  summary: string | null;
  messagesCount: number;
}

interface SessionRecoveryCompleted {
  mode: "completed";
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
}

export type SessionRecoverySnapshot =
  | SessionRecoveryFresh
  | SessionRecoveryResume
  | SessionRecoveryRestart
  | SessionRecoveryCompleted;

export interface SessionRecoveryState {
  mode: "restart" | "completed";
  title: string;
  description: string;
  actionLabel: string | null;
  summary: string | null;
  statusLabel: string;
}

export interface SessionResumeNotice {
  title: string;
  description: string;
}

class StudySessionApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, options: { code?: string; status: number }) {
    super(message);
    this.name = "StudySessionApiError";
    this.code = options.code;
    this.status = options.status;
  }
}

export interface StudySessionApi {
  fetchSessionState: (blockId: string) => Promise<{
    block: SessionBlockInfo;
    recovery: SessionRecoverySnapshot;
  }>;
  startSession: (
    blockId: string,
    options?: { restart?: boolean }
  ) => Promise<{
    sessionId: string;
    systemPrompt: string;
    initialMessage: string;
  }>;
  sendMessage: (
    sessionId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    systemPrompt: string
  ) => Promise<ReadableStream<Uint8Array>>;
  endSession: (
    sessionId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    systemPrompt: string,
    reason: "completed" | "abandoned" | "timeout",
    confidence?: { before: number | null; after: number | null }
  ) => Promise<{ outcome: AttemptOutcome; summary: string }>;
}

async function createApiError(
  response: Response,
  fallbackMessage: string
): Promise<StudySessionApiError> {
  let payload: { error?: { code?: string; message?: string } } | null = null;

  try {
    payload = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
  } catch {
    payload = null;
  }

  return new StudySessionApiError(
    payload?.error?.message ?? fallbackMessage,
    {
      code: payload?.error?.code,
      status: response.status,
    }
  );
}

function defaultApi(): StudySessionApi {
  return {
    async fetchSessionState(blockId: string) {
      const res = await fetch(`/api/sessions/block/${blockId}`);
      if (!res.ok) {
        throw await createApiError(
          res,
          `Failed to load session state: ${res.status}`
        );
      }

      const { data } = (await res.json()) as {
        data: {
          block: SessionBlockInfo;
          recovery: SessionRecoverySnapshot;
        };
      };

      return data;
    },
    async startSession(blockId, options) {
      const res = await fetch("/api/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId,
          restart: options?.restart ?? false,
        }),
      });

      if (!res.ok) {
        throw await createApiError(res, `Failed to start session: ${res.status}`);
      }

      const { data } = (await res.json()) as {
        data: {
          sessionId: string;
          systemPrompt: string;
          initialMessage: string;
        };
      };

      return data;
    },
    async sendMessage(sessionId, messages, systemPrompt) {
      const res = await fetch(`/api/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, systemPrompt }),
      });

      if (!res.ok) {
        throw await createApiError(res, `Failed to send message: ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body for streaming");
      }

      return res.body;
    },
    async endSession(sessionId, messages, systemPrompt, reason, confidence) {
      const res = await fetch(`/api/sessions/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, systemPrompt, reason, confidence }),
      });

      if (!res.ok) {
        throw await createApiError(res, `Failed to end session: ${res.status}`);
      }

      const { data } = (await res.json()) as {
        data: { outcome: AttemptOutcome; summary: string };
      };

      return data;
    },
  };
}

function nextMessageId(): string {
  return crypto.randomUUID();
}

function toSessionMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  startedAt: string
): SessionMessage[] {
  const fallbackTimestamp = new Date(startedAt);
  const timestamp = Number.isNaN(fallbackTimestamp.getTime())
    ? new Date()
    : fallbackTimestamp;

  return messages.map((message) => ({
    id: nextMessageId(),
    role: message.role,
    content: message.content,
    timestamp,
  }));
}

function buildRecoveryState(
  block: SessionBlockInfo,
  recovery: SessionRecoveryRestart | SessionRecoveryCompleted
): SessionRecoveryState {
  if (recovery.mode === "completed") {
    return {
      mode: "completed",
      title: "This session is already complete",
      description:
        recovery.summary?.trim() ||
        `You already finished ${block.topicName}. Head back to your dashboard for the next step.`,
      actionLabel: null,
      summary: recovery.summary,
      statusLabel: "Complete",
    };
  }

  if (recovery.reason === "abandoned") {
    return {
      mode: "restart",
      title: "Pick this session back up",
      description:
        recovery.summary?.trim() ||
        `You left ${block.topicName} early. Start a fresh session when you're ready.`,
      actionLabel: "Start fresh",
      summary: recovery.summary,
      statusLabel: "Left early",
    };
  }

  if (recovery.reason === "timeout") {
    return {
      mode: "restart",
      title: "Start this session fresh",
      description:
        recovery.summary?.trim() ||
        `This ${block.topicName} session timed out before it wrapped up. Start again to continue cleanly.`,
      actionLabel: "Restart session",
      summary: recovery.summary,
      statusLabel: "Timed out",
    };
  }

  return {
    mode: "restart",
    title: "Recover with a fresh start",
    description:
      "We couldn't safely restore the last in-progress session. The safest next step is to restart this block.",
    actionLabel: "Restart safely",
    summary: recovery.summary,
    statusLabel: "Needs restart",
  };
}

function buildResumeNotice(block: SessionBlockInfo): SessionResumeNotice {
  return {
    title: "Session resumed",
    description: `You're back in ${block.topicName}. Continue from your last exchange.`,
  };
}

const RECOVERABLE_ERROR_CODES = new Set([
  "ACTIVE_SESSION_EXISTS",
  "ACTIVE_SESSION_RESTART_REQUIRED",
  "NOT_FOUND",
  "SESSION_NOT_ACTIVE",
  "SESSION_TRANSCRIPT_MISMATCH",
  "SESSION_TRANSCRIPT_MISSING",
]);

function isRecoverableSessionError(
  error: unknown
): error is { code: string; status?: number } {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as Error & { code?: string }).code;
  return typeof code === "string" && RECOVERABLE_ERROR_CODES.has(code);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface UseStudySessionOptions {
  blockId: string;
  api?: StudySessionApi;
}

export interface UseStudySessionReturn {
  phase: SessionPhase;
  block: SessionBlockInfo | null;
  messages: SessionMessage[];
  isStreaming: boolean;
  sessionId: string | null;
  result: SessionResult | null;
  elapsedSeconds: number;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  error: string | null;
  recoveryState: SessionRecoveryState | null;
  resumeNotice: SessionResumeNotice | null;
  submitConfidenceBefore: (value: number) => void;
  submitConfidenceAfter: (value: number) => void;
  sendMessage: (content: string) => Promise<void>;
  abandonSession: () => Promise<void>;
  restartSession: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useStudySession({
  blockId,
  api,
}: UseStudySessionOptions): UseStudySessionReturn {
  const sessionApi = api ?? defaultApi();
  const apiRef = useRef(sessionApi);
  apiRef.current = sessionApi;

  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [block, setBlock] = useState<SessionBlockInfo | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confidenceBefore, setConfidenceBefore] = useState<number | null>(null);
  const [confidenceAfter, setConfidenceAfter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryState, setRecoveryState] = useState<SessionRecoveryState | null>(
    null
  );
  const [resumeNotice, setResumeNotice] = useState<SessionResumeNotice | null>(
    null
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const messagesRef = useRef<SessionMessage[]>([]);
  const reloadStateRef = useRef<() => Promise<void>>(async () => {});
  const confidenceBeforeRef = useRef<number | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    confidenceBeforeRef.current = confidenceBefore;
  }, [confidenceBefore]);

  const resetInteractiveState = useCallback(
    (options: { clearConfidenceBefore?: boolean } = {}) => {
      setMessages([]);
      messagesRef.current = [];
      setIsStreaming(false);
      setSessionId(null);
      setSystemPrompt(null);
      setResult(null);
      setElapsedSeconds(0);
      setConfidenceAfter(null);
      setRecoveryState(null);
      setResumeNotice(null);
      startTimeRef.current = null;
      abortRef.current = null;

      if (options.clearConfidenceBefore) {
        setConfidenceBefore(null);
      }
    },
    []
  );

  const finalizeRecoveredCompletion = useCallback(
    async (snapshot: SessionRecoveryResume) => {
      setPhase("completing");

      try {
        const endResult = await apiRef.current.endSession(
          snapshot.sessionId,
          snapshot.messages,
          snapshot.systemPrompt,
          "completed",
          { before: confidenceBeforeRef.current, after: null }
        );
        setResult(endResult);
        setRecoveryState(null);
        setResumeNotice(null);
        setPhase("confidence-after");
      } catch (err: unknown) {
        if (isRecoverableSessionError(err)) {
          await reloadStateRef.current();
          return;
        }

        setError(getErrorMessage(err, "Failed to end session"));
        setPhase("error");
      }
    },
    []
  );

  const applyRecoverySnapshot = useCallback(
    async (
      blockInfo: SessionBlockInfo,
      recovery: SessionRecoverySnapshot
    ): Promise<void> => {
      setBlock(blockInfo);
      setError(null);

      if (recovery.mode === "fresh") {
        resetInteractiveState({ clearConfidenceBefore: true });
        setPhase("confidence-before");
        return;
      }

      if (recovery.mode === "resume") {
        const hydratedMessages = toSessionMessages(
          recovery.messages,
          recovery.startedAt
        );

        setRecoveryState(null);
        setResumeNotice(
          recovery.completionPending ? null : buildResumeNotice(blockInfo)
        );
        setResult(null);
        setSessionId(recovery.sessionId);
        setSystemPrompt(recovery.systemPrompt);
        setMessages(hydratedMessages);
        messagesRef.current = hydratedMessages;
        setIsStreaming(false);

        const startedAtMs = new Date(recovery.startedAt).getTime();
        startTimeRef.current = Number.isNaN(startedAtMs)
          ? Date.now()
          : startedAtMs;
        setElapsedSeconds(
          Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000))
        );

        if (recovery.completionPending) {
          await finalizeRecoveredCompletion(recovery);
          return;
        }

        setPhase("active");
        return;
      }

      resetInteractiveState({ clearConfidenceBefore: true });
      setRecoveryState(buildRecoveryState(blockInfo, recovery));
      setPhase("recovery");
    },
    [finalizeRecoveredCompletion, resetInteractiveState]
  );

  const loadSessionState = useCallback(async () => {
    setPhase("loading");

    try {
      const state = await apiRef.current.fetchSessionState(blockId);
      await applyRecoverySnapshot(state.block, state.recovery);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load session"));
      setRecoveryState(null);
      setResumeNotice(null);
      setPhase("error");
    }
  }, [applyRecoverySnapshot, blockId]);

  reloadStateRef.current = loadSessionState;

  useEffect(() => {
    let cancelled = false;

    setPhase("loading");
    setError(null);

    void (async () => {
      try {
        const state = await apiRef.current.fetchSessionState(blockId);
        if (cancelled) {
          return;
        }
        await applyRecoverySnapshot(state.block, state.recovery);
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        setError(getErrorMessage(err, "Failed to load session"));
        setRecoveryState(null);
        setResumeNotice(null);
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyRecoverySnapshot, blockId]);

  useEffect(() => {
    if (phase === "active" || phase === "streaming") {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }

      timerRef.current = setInterval(() => {
        if (!startTimeRef.current) {
          return;
        }

        setElapsedSeconds(
          Math.floor((Date.now() - startTimeRef.current) / 1000)
        );
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return undefined;
  }, [phase]);

  const startFreshSession = useCallback(
    async (options?: { confidenceBefore?: number | null; restart?: boolean }) => {
      if (options && "confidenceBefore" in options) {
        setConfidenceBefore(options.confidenceBefore ?? null);
      }

      setError(null);
      setRecoveryState(null);
      setResumeNotice(null);
      setResult(null);
      setConfidenceAfter(null);
      setMessages([]);
      messagesRef.current = [];
      setIsStreaming(false);
      setSessionId(null);
      setSystemPrompt(null);
      setElapsedSeconds(0);
      startTimeRef.current = null;
      setPhase("starting");

      try {
        const { sessionId: nextSessionId, systemPrompt: nextSystemPrompt, initialMessage } =
          await apiRef.current.startSession(blockId, {
            restart: options?.restart ?? false,
          });

        const initialMessages: SessionMessage[] = [
          {
            id: nextMessageId(),
            role: "assistant",
            content: initialMessage,
            timestamp: new Date(),
          },
        ];

        setSessionId(nextSessionId);
        setSystemPrompt(nextSystemPrompt);
        setMessages(initialMessages);
        messagesRef.current = initialMessages;
        startTimeRef.current = Date.now();
        setPhase("active");
      } catch (err: unknown) {
        if (isRecoverableSessionError(err)) {
          await loadSessionState();
          return;
        }

        setError(getErrorMessage(err, "Failed to start session"));
        setPhase("error");
      }
    },
    [blockId, loadSessionState]
  );

  const submitConfidenceBefore = useCallback(
    (value: number) => {
      void startFreshSession({ confidenceBefore: value });
    },
    [startFreshSession]
  );

  const restartSession = useCallback(async () => {
    setConfidenceBefore(null);
    await startFreshSession({ confidenceBefore: null, restart: true });
  }, [startFreshSession]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !systemPrompt || isStreaming) {
        return;
      }

      const userMsg: SessionMessage = {
        id: nextMessageId(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setPhase("streaming");

      const assistantMsgId = nextMessageId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ]);

      try {
        const currentMessages = messagesRef.current;
        const apiMessages = [...currentMessages, userMsg].map((message) => ({
          role: message.role,
          content: message.content,
        }));

        const stream = await apiRef.current.sendMessage(
          sessionId,
          apiMessages,
          systemPrompt
        );
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        abortRef.current = new AbortController();

        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;

          if (result.value) {
            const chunk = decoder.decode(result.value, { stream: !done });
            fullText += chunk;
            const currentText = fullText;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMsgId
                  ? { ...message, content: currentText }
                  : message
              )
            );
          }
        }

        const hasComplete =
          /<session_status>complete<\/session_status>/.test(fullText);
        const cleanText = fullText
          .replace(/<session_status>complete<\/session_status>/g, "")
          .trim();

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMsgId
              ? { ...message, content: cleanText }
              : message
          )
        );

        if (hasComplete) {
          setPhase("completing");

          try {
            const allMessages = [
              ...currentMessages,
              userMsg,
              {
                id: assistantMsgId,
                role: "assistant" as const,
                content: cleanText,
                timestamp: new Date(),
              },
            ].map((message) => ({
              role: message.role,
              content: message.content,
            }));

            const endResult = await apiRef.current.endSession(
              sessionId,
              allMessages,
              systemPrompt,
              "completed",
              { before: confidenceBefore, after: null }
            );
            setResult(endResult);
            setResumeNotice(null);
            setPhase("confidence-after");
          } catch (err: unknown) {
            if (isRecoverableSessionError(err)) {
              await loadSessionState();
              return;
            }

            setError(getErrorMessage(err, "Failed to end session"));
            setPhase("error");
          }
        } else {
          setPhase("active");
        }
      } catch (err: unknown) {
        setMessages((prev) => prev.filter((message) => message.id !== assistantMsgId));

        if (isRecoverableSessionError(err)) {
          await loadSessionState();
          return;
        }

        setError(getErrorMessage(err, "Failed to send message"));
        setPhase("active");
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [confidenceBefore, isStreaming, loadSessionState, sessionId, systemPrompt]
  );

  const submitConfidenceAfter = useCallback((value: number) => {
    setConfidenceAfter(value);
    setPhase("complete");
  }, []);

  const abandonSession = useCallback(async () => {
    if (!sessionId || !systemPrompt) {
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }

    setPhase("completing");

    try {
      const apiMessages = messagesRef.current.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const endResult = await apiRef.current.endSession(
        sessionId,
        apiMessages,
        systemPrompt,
        "abandoned",
        { before: confidenceBefore, after: confidenceAfter }
      );
      setResult(endResult);
      setResumeNotice(null);
      setPhase("complete");
    } catch (err: unknown) {
      if (isRecoverableSessionError(err)) {
        await loadSessionState();
        return;
      }

      setError(getErrorMessage(err, "Failed to end session"));
      setPhase("error");
    }
  }, [
    confidenceAfter,
    confidenceBefore,
    loadSessionState,
    sessionId,
    systemPrompt,
  ]);

  const retry = useCallback(async () => {
    await loadSessionState();
  }, [loadSessionState]);

  return {
    phase,
    block,
    messages,
    isStreaming,
    sessionId,
    result,
    elapsedSeconds,
    confidenceBefore,
    confidenceAfter,
    error,
    recoveryState,
    resumeNotice,
    submitConfidenceBefore,
    submitConfidenceAfter,
    sendMessage,
    abandonSession,
    restartSession,
    retry,
  };
}
