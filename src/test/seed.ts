import { getTestDb } from "./setup";
import {
  examBoards,
  subjects,
  qualifications,
  qualificationVersions,
  assessmentComponents,
  topics,
  topicEdges,
  commandWords,
  questionTypes,
} from "@/db/schema";
import type { QualificationVersionId, TopicId } from "@/lib/types";
import { eq } from "drizzle-orm";

export async function seedGCSEBiology() {
  const db = getTestDb();

  // Exam board
  const [board] = await db
    .insert(examBoards)
    .values({ name: "AQA", code: "AQA", country: "GB" })
    .onConflictDoNothing({ target: examBoards.code })
    .returning();
  const boardRow =
    board ??
    (await db.select().from(examBoards).where(eq(examBoards.code, "AQA")))[0];

  // Subject
  const [subj] = await db
    .insert(subjects)
    .values({ name: "Biology", slug: "biology" })
    .onConflictDoNothing({ target: subjects.slug })
    .returning();
  const subjRow =
    subj ??
    (await db.select().from(subjects).where(eq(subjects.slug, "biology")))[0];

  // Qualification
  const [qual] = await db
    .insert(qualifications)
    .values({ subjectId: subjRow.id, level: "GCSE", name: "GCSE Biology" })
    .onConflictDoNothing()
    .returning();
  const qualRow =
    qual ??
    (
      await db
        .select()
        .from(qualifications)
        .where(eq(qualifications.subjectId, subjRow.id))
    )[0];

  // Qualification version (AQA 8461)
  const [version] = await db
    .insert(qualificationVersions)
    .values({
      qualificationId: qualRow.id,
      examBoardId: boardRow.id,
      versionCode: "8461",
      firstExamYear: 2018,
      totalMarks: 200,
      specUrl:
        "https://www.aqa.org.uk/subjects/science/gcse/biology-8461",
    })
    .onConflictDoNothing()
    .returning();
  const versionRow =
    version ??
    (
      await db
        .select()
        .from(qualificationVersions)
        .where(eq(qualificationVersions.versionCode, "8461"))
    )[0];

  const qvId = versionRow.id as QualificationVersionId;

  // Assessment components
  await db
    .insert(assessmentComponents)
    .values([
      {
        qualificationVersionId: versionRow.id,
        name: "Paper 1: Cell Biology; Organisation; Infection and Response; Bioenergetics",
        code: "8461/1H",
        weightPercent: 50,
        durationMinutes: 105,
        totalMarks: 100,
        isExam: true,
      },
      {
        qualificationVersionId: versionRow.id,
        name: "Paper 2: Homeostasis and Response; Inheritance, Variation and Evolution; Ecology",
        code: "8461/2H",
        weightPercent: 50,
        durationMinutes: 105,
        totalMarks: 100,
        isExam: true,
      },
    ])
    .onConflictDoNothing();

  // Topic tree (minimal but real structure from AQA 8461 spec)
  const topicMap = new Map<string, string>();

  async function insertTopic(
    name: string,
    code: string,
    depth: number,
    sortOrder: number,
    parentCode?: string,
    description?: string
  ) {
    const parentId = parentCode ? topicMap.get(parentCode) : undefined;
    const [t] = await db
      .insert(topics)
      .values({
        qualificationVersionId: versionRow.id,
        parentTopicId: parentId ?? null,
        name,
        code,
        depth,
        sortOrder,
        description,
      })
      .returning();
    topicMap.set(code, t.id);
    return t;
  }

  // Unit 4.1: Cell Biology
  await insertTopic("Cell Biology", "4.1", 0, 1, undefined, "Cell structure, transport, and division");
  await insertTopic("Cell Structure", "4.1.1", 1, 1, "4.1", "Eukaryotic and prokaryotic cells");
  await insertTopic("Cell Division", "4.1.2", 1, 2, "4.1", "Mitosis and the cell cycle");
  await insertTopic("Transport in Cells", "4.1.3", 1, 3, "4.1", "Diffusion, osmosis, active transport");

  // Unit 4.2: Organisation
  await insertTopic("Organisation", "4.2", 0, 2, undefined, "Cells, tissues, organs, organ systems");
  await insertTopic("Principles of Organisation", "4.2.1", 1, 1, "4.2");
  await insertTopic("The Digestive System", "4.2.2", 1, 2, "4.2", "Enzymes and digestion");
  await insertTopic("Blood and the Heart", "4.2.3", 1, 3, "4.2");

  // Unit 4.3: Infection and Response
  await insertTopic("Infection and Response", "4.3", 0, 3, undefined);
  await insertTopic("Communicable Diseases", "4.3.1", 1, 1, "4.3", "Pathogens and disease");
  await insertTopic("Preventing and Treating Disease", "4.3.2", 1, 2, "4.3", "Vaccination and antibiotics");
  await insertTopic("Non-communicable Diseases", "4.3.3", 1, 3, "4.3");

  // Unit 4.4: Bioenergetics
  await insertTopic("Bioenergetics", "4.4", 0, 4, undefined);
  await insertTopic("Photosynthesis", "4.4.1", 1, 1, "4.4");
  await insertTopic("Respiration", "4.4.2", 1, 2, "4.4", "Aerobic and anaerobic respiration");

  // Unit 4.5: Homeostasis and Response
  await insertTopic("Homeostasis and Response", "4.5", 0, 5, undefined);
  await insertTopic("Homeostasis", "4.5.1", 1, 1, "4.5", "Nervous system and control");
  await insertTopic("The Human Nervous System", "4.5.2", 1, 2, "4.5");
  await insertTopic("Hormonal Coordination", "4.5.3", 1, 3, "4.5");

  // Unit 4.6: Inheritance, Variation and Evolution
  await insertTopic("Inheritance, Variation and Evolution", "4.6", 0, 6, undefined);
  await insertTopic("Reproduction", "4.6.1", 1, 1, "4.6", "Sexual and asexual reproduction");
  await insertTopic("Variation and Evolution", "4.6.2", 1, 2, "4.6", "Darwin, natural selection");
  await insertTopic("Genetics and Evolution", "4.6.3", 1, 3, "4.6");

  // Unit 4.7: Ecology
  await insertTopic("Ecology", "4.7", 0, 7, undefined);
  await insertTopic("Adaptations, Interdependence and Competition", "4.7.1", 1, 1, "4.7");
  await insertTopic("Organisation of an Ecosystem", "4.7.2", 1, 2, "4.7");
  await insertTopic("Biodiversity", "4.7.3", 1, 3, "4.7");

  // Topic edges (prerequisite relationships)
  const edges: Array<{ from: string; to: string; type: "prerequisite" | "builds_on" | "related" }> = [
    { from: "4.1.1", to: "4.1.2", type: "prerequisite" },
    { from: "4.1.1", to: "4.1.3", type: "prerequisite" },
    { from: "4.1.1", to: "4.2.1", type: "prerequisite" },
    { from: "4.2.1", to: "4.2.2", type: "builds_on" },
    { from: "4.2.1", to: "4.2.3", type: "builds_on" },
    { from: "4.1.3", to: "4.4.1", type: "prerequisite" },
    { from: "4.1.3", to: "4.4.2", type: "prerequisite" },
    { from: "4.4.1", to: "4.4.2", type: "related" },
    { from: "4.1.2", to: "4.6.1", type: "prerequisite" },
    { from: "4.6.1", to: "4.6.2", type: "prerequisite" },
    { from: "4.6.2", to: "4.6.3", type: "builds_on" },
  ];

  for (const edge of edges) {
    const fromId = topicMap.get(edge.from);
    const toId = topicMap.get(edge.to);
    if (fromId && toId) {
      await db
        .insert(topicEdges)
        .values({
          fromTopicId: fromId,
          toTopicId: toId,
          edgeType: edge.type,
        })
        .onConflictDoNothing();
    }
  }

  // Command words
  await db
    .insert(commandWords)
    .values([
      { qualificationVersionId: versionRow.id, word: "Calculate", definition: "Determine the value of something from the information given.", expectedDepth: 2 },
      { qualificationVersionId: versionRow.id, word: "Compare", definition: "Identify similarities and differences.", expectedDepth: 3 },
      { qualificationVersionId: versionRow.id, word: "Describe", definition: "Give an account of something without explanations.", expectedDepth: 1 },
      { qualificationVersionId: versionRow.id, word: "Evaluate", definition: "Judge from available evidence or information.", expectedDepth: 4 },
      { qualificationVersionId: versionRow.id, word: "Explain", definition: "Make something clear, or state the reasons for something.", expectedDepth: 3 },
      { qualificationVersionId: versionRow.id, word: "Suggest", definition: "Apply knowledge and understanding to a new situation.", expectedDepth: 3 },
    ])
    .onConflictDoNothing();

  // Question types
  await db
    .insert(questionTypes)
    .values([
      { qualificationVersionId: versionRow.id, name: "Multiple choice", typicalMarks: 1 },
      { qualificationVersionId: versionRow.id, name: "Short answer", typicalMarks: 2, description: "Brief factual recall" },
      { qualificationVersionId: versionRow.id, name: "Structured question", typicalMarks: 4, description: "Multi-part question building on a scenario" },
      { qualificationVersionId: versionRow.id, name: "6-mark extended response", typicalMarks: 6, markSchemePattern: "Level 3 (5-6 marks): detailed, logically structured. Level 2 (3-4 marks): mostly correct, some structure. Level 1 (1-2 marks): basic, limited detail." },
    ])
    .onConflictDoNothing();

  // Return IDs for test use
  const allTopics = Array.from(topicMap.entries()).map(([code, id]) => ({
    id: id as TopicId,
    code,
  }));

  return {
    qualificationVersionId: qvId,
    examBoardId: boardRow.id,
    subjectId: subjRow.id,
    qualificationId: qualRow.id,
    topics: allTopics,
    topicMap,
  };
}
