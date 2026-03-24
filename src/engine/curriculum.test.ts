import { describe, it, expect } from "vitest";
import { getTestDb } from "@/test/setup";
import { loadQualification, getTopicTree, qualificationSeedSchema } from "./curriculum";
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
  misconceptionRules,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type {
  QualificationSeed,
  QualificationVersionId,
  TopicTreeNode,
} from "@/lib/types";
import seedJson from "@/data/seeds/gcse-biology-aqa.json";

const minimalSeed: QualificationSeed = {
  subject: { name: "Chemistry", slug: "chemistry" },
  examBoard: { name: "AQA", code: "AQA" },
  level: "GCSE",
  versionCode: "8462",
  firstExamYear: 2018,
  components: [
    {
      name: "Paper 1",
      code: "8462/1H",
      weightPercent: 50,
      durationMinutes: 105,
      totalMarks: 100,
      isExam: true,
    },
    {
      name: "Paper 2",
      code: "8462/2H",
      weightPercent: 50,
      durationMinutes: 105,
      totalMarks: 100,
      isExam: true,
    },
  ],
  topics: [
    {
      name: "Atomic Structure",
      code: "5.1",
      description: "Atoms, elements, and compounds",
      estimatedHours: 10,
      children: [
        {
          name: "Atoms",
          code: "5.1.1",
          description: "Structure of atoms",
          estimatedHours: 3,
        },
        {
          name: "The Periodic Table",
          code: "5.1.2",
          description: "Organisation of elements",
          estimatedHours: 4,
          edges: [{ toCode: "5.1.1", type: "prerequisite" }],
        },
        {
          name: "Properties of Transition Metals",
          code: "5.1.3",
          estimatedHours: 3,
          edges: [
            { toCode: "5.1.2", type: "builds_on" },
            { toCode: "5.1.1", type: "prerequisite" },
          ],
        },
      ],
    },
    {
      name: "Bonding",
      code: "5.2",
      description: "Chemical bonds and structure",
      children: [
        {
          name: "Ionic Bonding",
          code: "5.2.1",
          edges: [{ toCode: "5.1.1", type: "prerequisite" }],
        },
      ],
    },
  ],
  commandWords: [
    {
      word: "Describe",
      definition: "Give an account of something.",
      expectedDepth: 1,
    },
    {
      word: "Explain",
      definition: "State the reasons for something.",
      expectedDepth: 3,
    },
  ],
  questionTypes: [
    {
      name: "Multiple choice",
      typicalMarks: 1,
      description: "Select one answer",
    },
    {
      name: "Extended response",
      typicalMarks: 6,
      markSchemePattern: "Levelled response",
    },
  ],
  misconceptionRules: [
    {
      topicCode: "5.1.1",
      description: "Thinks atoms are solid spheres with no internal structure",
      triggerPatterns: ["atoms are solid", "no parts inside atom"],
      correctionGuidance:
        "Atoms have a nucleus containing protons and neutrons, surrounded by electrons in shells.",
      severity: 2,
    },
  ],
};

describe("loadQualification", () => {
  it("inserts all entities in a single transaction", async () => {
    const db = getTestDb();
    const result = await loadQualification(db, minimalSeed);

    expect(result.qualificationVersionId).toBeDefined();
    expect(result.topicsCreated).toBe(6); // 5.1, 5.1.1, 5.1.2, 5.1.3, 5.2, 5.2.1
    expect(result.componentsCreated).toBe(2);
    expect(result.edgesCreated).toBe(4); // 5.1.2→5.1.1, 5.1.3→5.1.2, 5.1.3→5.1.1, 5.2.1→5.1.1

    // Verify exam board was created
    const boards = await db
      .select()
      .from(examBoards)
      .where(eq(examBoards.code, "AQA"));
    expect(boards).toHaveLength(1);
    expect(boards[0].name).toBe("AQA");

    // Verify subject was created
    const subjs = await db
      .select()
      .from(subjects)
      .where(eq(subjects.slug, "chemistry"));
    expect(subjs).toHaveLength(1);

    // Verify qualification was created
    const quals = await db
      .select()
      .from(qualifications)
      .where(eq(qualifications.subjectId, subjs[0].id));
    expect(quals).toHaveLength(1);
    expect(quals[0].name).toBe("GCSE Chemistry");

    // Verify version
    const versions = await db
      .select()
      .from(qualificationVersions)
      .where(
        eq(qualificationVersions.id, result.qualificationVersionId)
      );
    expect(versions).toHaveLength(1);
    expect(versions[0].versionCode).toBe("8462");
    expect(versions[0].firstExamYear).toBe(2018);
    expect(versions[0].totalMarks).toBe(200);

    // Verify components
    const comps = await db
      .select()
      .from(assessmentComponents)
      .where(
        eq(
          assessmentComponents.qualificationVersionId,
          result.qualificationVersionId
        )
      );
    expect(comps).toHaveLength(2);

    // Verify topics
    const allTopics = await db
      .select()
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, result.qualificationVersionId)
      );
    expect(allTopics).toHaveLength(6);

    // Verify command words
    const cws = await db
      .select()
      .from(commandWords)
      .where(
        eq(
          commandWords.qualificationVersionId,
          result.qualificationVersionId
        )
      );
    expect(cws).toHaveLength(2);

    // Verify question types
    const qts = await db
      .select()
      .from(questionTypes)
      .where(
        eq(
          questionTypes.qualificationVersionId,
          result.qualificationVersionId
        )
      );
    expect(qts).toHaveLength(2);

    // Verify misconception rules
    const mrs = await db.select().from(misconceptionRules);
    expect(mrs).toHaveLength(1);
    expect(mrs[0].triggerPatterns).toEqual([
      "atoms are solid",
      "no parts inside atom",
    ]);
  });

  it("creates correct parent-child topic hierarchy", async () => {
    const db = getTestDb();
    const result = await loadQualification(db, minimalSeed);

    // Top-level topics should have no parent
    const topLevel = await db
      .select()
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, result.qualificationVersionId)
      );

    const roots = topLevel.filter((t) => t.parentTopicId === null);
    expect(roots).toHaveLength(2);
    expect(roots.map((r) => r.code).sort()).toEqual(["5.1", "5.2"]);

    // depth=0 for roots
    for (const root of roots) {
      expect(root.depth).toBe(0);
    }

    // Children of 5.1
    const atomicStructure = roots.find((r) => r.code === "5.1")!;
    const children = topLevel.filter(
      (t) => t.parentTopicId === atomicStructure.id
    );
    expect(children).toHaveLength(3);
    for (const child of children) {
      expect(child.depth).toBe(1);
    }
  });

  it("creates correct topic edges", async () => {
    const db = getTestDb();
    const result = await loadQualification(db, minimalSeed);

    const allTopics = await db
      .select()
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, result.qualificationVersionId)
      );
    const codeToId = new Map(allTopics.map((t) => [t.code, t.id]));

    const edges = await db.select().from(topicEdges);
    expect(edges).toHaveLength(4);

    // 5.1.2 has prerequisite edge to 5.1.1
    const prereqEdge = edges.find(
      (e) =>
        e.fromTopicId === codeToId.get("5.1.2") &&
        e.toTopicId === codeToId.get("5.1.1")
    );
    expect(prereqEdge).toBeDefined();
    expect(prereqEdge!.edgeType).toBe("prerequisite");

    // 5.1.3 builds_on 5.1.2
    const buildsOnEdge = edges.find(
      (e) =>
        e.fromTopicId === codeToId.get("5.1.3") &&
        e.toTopicId === codeToId.get("5.1.2")
    );
    expect(buildsOnEdge).toBeDefined();
    expect(buildsOnEdge!.edgeType).toBe("builds_on");

    // 5.2.1 prerequisite 5.1.1 (cross-branch edge)
    const crossEdge = edges.find(
      (e) =>
        e.fromTopicId === codeToId.get("5.2.1") &&
        e.toTopicId === codeToId.get("5.1.1")
    );
    expect(crossEdge).toBeDefined();
    expect(crossEdge!.edgeType).toBe("prerequisite");
  });

  it("is idempotent — running twice does not create duplicates", async () => {
    const db = getTestDb();

    const first = await loadQualification(db, minimalSeed);
    const second = await loadQualification(db, minimalSeed);

    // Second run should return 0 created counts
    expect(second.qualificationVersionId).toBe(
      first.qualificationVersionId
    );
    expect(second.topicsCreated).toBe(0);
    expect(second.componentsCreated).toBe(0);
    expect(second.edgesCreated).toBe(0);

    // Verify no duplicates in DB
    const allTopics = await db
      .select()
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, first.qualificationVersionId)
      );
    expect(allTopics).toHaveLength(6);

    const comps = await db
      .select()
      .from(assessmentComponents)
      .where(
        eq(
          assessmentComponents.qualificationVersionId,
          first.qualificationVersionId
        )
      );
    expect(comps).toHaveLength(2);

    const boards = await db
      .select()
      .from(examBoards)
      .where(eq(examBoards.code, "AQA"));
    expect(boards).toHaveLength(1);
  });

  it("reuses existing exam board and subject from a different qualification", async () => {
    const db = getTestDb();

    // Load chemistry first
    await loadQualification(db, minimalSeed);

    // Load a second qualification sharing the same exam board
    const physicsSeed: QualificationSeed = {
      subject: { name: "Physics", slug: "physics" },
      examBoard: { name: "AQA", code: "AQA" }, // same board
      level: "GCSE",
      versionCode: "8463",
      firstExamYear: 2018,
      components: [
        {
          name: "Paper 1",
          code: "8463/1H",
          weightPercent: 50,
          isExam: true,
        },
      ],
      topics: [
        { name: "Energy", code: "P1", estimatedHours: 5 },
      ],
      commandWords: [
        {
          word: "Calculate",
          definition: "Work out the answer.",
          expectedDepth: 2,
        },
      ],
      questionTypes: [
        { name: "Calculation", typicalMarks: 3 },
      ],
    };

    const result = await loadQualification(db, physicsSeed);
    expect(result.topicsCreated).toBe(1);

    // Should still be only 1 AQA board row
    const boards = await db
      .select()
      .from(examBoards)
      .where(eq(examBoards.code, "AQA"));
    expect(boards).toHaveLength(1);

    // But 2 subjects
    const allSubjects = await db.select().from(subjects);
    expect(allSubjects).toHaveLength(2);
  });

  it("handles seed data with no misconception rules", async () => {
    const db = getTestDb();
    const seedWithoutMisconceptions: QualificationSeed = {
      ...minimalSeed,
      subject: { name: "Maths", slug: "maths" },
      versionCode: "8300",
      level: "GCSE",
      misconceptionRules: undefined,
    };

    const result = await loadQualification(db, seedWithoutMisconceptions);
    expect(result.qualificationVersionId).toBeDefined();
    expect(result.topicsCreated).toBe(6);

    const mrs = await db.select().from(misconceptionRules);
    expect(mrs).toHaveLength(0);
  });

  it("handles seed data with no optional component fields", async () => {
    const db = getTestDb();
    const seed: QualificationSeed = {
      subject: { name: "Art", slug: "art" },
      examBoard: { name: "OCR", code: "OCR" },
      level: "GCSE",
      versionCode: "J171",
      firstExamYear: 2019,
      components: [
        {
          name: "Portfolio",
          code: "J171/01",
          weightPercent: 60,
          isExam: false,
          // no durationMinutes, no totalMarks
        },
      ],
      topics: [{ name: "Drawing", code: "ART1" }],
      commandWords: [
        {
          word: "Analyse",
          definition: "Examine in detail.",
          expectedDepth: 3,
        },
      ],
      questionTypes: [{ name: "Portfolio piece" }],
    };

    const result = await loadQualification(db, seed);
    expect(result.componentsCreated).toBe(1);

    const comps = await db
      .select()
      .from(assessmentComponents)
      .where(
        eq(
          assessmentComponents.qualificationVersionId,
          result.qualificationVersionId
        )
      );
    expect(comps[0].durationMinutes).toBeNull();
    expect(comps[0].totalMarks).toBeNull();
    expect(comps[0].isExam).toBe(false);
  });

  it("handles topics without codes", async () => {
    const db = getTestDb();
    const seed: QualificationSeed = {
      subject: { name: "English", slug: "english" },
      examBoard: { name: "Edexcel", code: "EDEXCEL" },
      level: "GCSE",
      versionCode: "1EN0",
      firstExamYear: 2017,
      components: [
        {
          name: "Paper 1",
          code: "1EN0/01",
          weightPercent: 100,
          isExam: true,
        },
      ],
      topics: [
        {
          name: "Shakespeare",
          // no code
          children: [
            { name: "Macbeth" },
            { name: "Romeo and Juliet" },
          ],
        },
      ],
      commandWords: [
        {
          word: "Evaluate",
          definition: "Judge something.",
          expectedDepth: 4,
        },
      ],
      questionTypes: [{ name: "Essay", typicalMarks: 30 }],
    };

    const result = await loadQualification(db, seed);
    expect(result.topicsCreated).toBe(3);

    const allTopics = await db
      .select()
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, result.qualificationVersionId)
      );
    const codelessTopics = allTopics.filter((t) => t.code === null);
    expect(codelessTopics).toHaveLength(3);
  });

  it("ignores edges referencing unknown topic codes", async () => {
    const db = getTestDb();
    const seed: QualificationSeed = {
      subject: { name: "History", slug: "history" },
      examBoard: { name: "AQA", code: "AQA" },
      level: "GCSE",
      versionCode: "8145",
      firstExamYear: 2018,
      components: [
        {
          name: "Paper 1",
          code: "8145/1",
          weightPercent: 100,
          isExam: true,
        },
      ],
      topics: [
        {
          name: "Medieval England",
          code: "H1",
          edges: [{ toCode: "NONEXISTENT", type: "prerequisite" }],
        },
      ],
      commandWords: [
        {
          word: "Explain",
          definition: "State reasons.",
          expectedDepth: 3,
        },
      ],
      questionTypes: [{ name: "Source analysis" }],
    };

    const result = await loadQualification(db, seed);
    expect(result.edgesCreated).toBe(0);
    expect(result.topicsCreated).toBe(1);
  });

  it("ignores misconception rules referencing unknown topic codes", async () => {
    const db = getTestDb();
    const seed: QualificationSeed = {
      subject: { name: "Geography", slug: "geography" },
      examBoard: { name: "AQA", code: "AQA" },
      level: "GCSE",
      versionCode: "8035",
      firstExamYear: 2018,
      components: [
        {
          name: "Paper 1",
          code: "8035/1",
          weightPercent: 100,
          isExam: true,
        },
      ],
      topics: [{ name: "Rivers", code: "G1" }],
      commandWords: [
        {
          word: "Describe",
          definition: "Give an account.",
          expectedDepth: 1,
        },
      ],
      questionTypes: [{ name: "Map reading" }],
      misconceptionRules: [
        {
          topicCode: "NONEXISTENT",
          description: "Should be skipped",
          triggerPatterns: ["test"],
          correctionGuidance: "test",
          severity: 1,
        },
      ],
    };

    await loadQualification(db, seed);
    const mrs = await db.select().from(misconceptionRules);
    expect(mrs).toHaveLength(0);
  });

  it("loads the full GCSE Biology AQA seed successfully", async () => {
    const db = getTestDb();
    const result = await loadQualification(
      db,
      seedJson as QualificationSeed
    );

    expect(result.qualificationVersionId).toBeDefined();
    expect(result.topicsCreated).toBeGreaterThan(40);
    expect(result.componentsCreated).toBe(2);
    expect(result.edgesCreated).toBeGreaterThan(10);

    // Verify topic tree structure
    const allTopics = await db
      .select()
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, result.qualificationVersionId)
      );

    // Should have 7 top-level units (4.1 through 4.7)
    const roots = allTopics.filter((t) => t.parentTopicId === null);
    expect(roots).toHaveLength(7);

    // Should have command words
    const cws = await db
      .select()
      .from(commandWords)
      .where(
        eq(
          commandWords.qualificationVersionId,
          result.qualificationVersionId
        )
      );
    expect(cws.length).toBeGreaterThan(10);

    // Should have question types
    const qts = await db
      .select()
      .from(questionTypes)
      .where(
        eq(
          questionTypes.qualificationVersionId,
          result.qualificationVersionId
        )
      );
    expect(qts.length).toBeGreaterThan(5);

    // Should have misconception rules
    const mrs = await db.select().from(misconceptionRules);
    expect(mrs.length).toBeGreaterThan(5);
  });

  it("sets correct sort_order for siblings", async () => {
    const db = getTestDb();
    const result = await loadQualification(db, minimalSeed);

    const allTopics = await db
      .select()
      .from(topics)
      .where(
        eq(topics.qualificationVersionId, result.qualificationVersionId)
      );

    // Roots should be ordered 1, 2
    const roots = allTopics
      .filter((t) => t.parentTopicId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(roots[0].code).toBe("5.1");
    expect(roots[0].sortOrder).toBe(1);
    expect(roots[1].code).toBe("5.2");
    expect(roots[1].sortOrder).toBe(2);

    // Children of 5.1 ordered 1, 2, 3
    const children = allTopics
      .filter((t) => t.parentTopicId === roots[0].id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(children).toHaveLength(3);
    expect(children[0].sortOrder).toBe(1);
    expect(children[1].sortOrder).toBe(2);
    expect(children[2].sortOrder).toBe(3);
  });
});

describe("getTopicTree", () => {
  it("returns the full tree structure with children nested correctly", async () => {
    const db = getTestDb();
    const loadResult = await loadQualification(db, minimalSeed);
    const qvId = loadResult.qualificationVersionId as QualificationVersionId;

    const tree = await getTopicTree(db, qvId);

    // 2 root nodes
    expect(tree).toHaveLength(2);

    // First root: Atomic Structure with 3 children
    const atomicStructure = tree.find((n) => n.code === "5.1");
    expect(atomicStructure).toBeDefined();
    expect(atomicStructure!.name).toBe("Atomic Structure");
    expect(atomicStructure!.depth).toBe(0);
    expect(atomicStructure!.children).toHaveLength(3);

    // Children sorted by sort_order
    expect(atomicStructure!.children[0].code).toBe("5.1.1");
    expect(atomicStructure!.children[1].code).toBe("5.1.2");
    expect(atomicStructure!.children[2].code).toBe("5.1.3");

    // Second root: Bonding with 1 child
    const bonding = tree.find((n) => n.code === "5.2");
    expect(bonding).toBeDefined();
    expect(bonding!.children).toHaveLength(1);
    expect(bonding!.children[0].code).toBe("5.2.1");
  });

  it("includes edges on topic nodes", async () => {
    const db = getTestDb();
    const loadResult = await loadQualification(db, minimalSeed);
    const qvId = loadResult.qualificationVersionId as QualificationVersionId;

    const tree = await getTopicTree(db, qvId);

    const atomicStructure = tree.find((n) => n.code === "5.1")!;
    const periodicTable = atomicStructure.children.find(
      (n) => n.code === "5.1.2"
    )!;

    // 5.1.2 has one prerequisite edge to 5.1.1
    expect(periodicTable.edges).toHaveLength(1);
    expect(periodicTable.edges[0].edgeType).toBe("prerequisite");

    // The target should be the atoms topic
    const atoms = atomicStructure.children.find((n) => n.code === "5.1.1")!;
    expect(periodicTable.edges[0].toTopicId).toBe(atoms.id);

    // 5.1.3 has 2 edges
    const transitionMetals = atomicStructure.children.find(
      (n) => n.code === "5.1.3"
    )!;
    expect(transitionMetals.edges).toHaveLength(2);
  });

  it("returns empty array for unknown qualification version", async () => {
    const db = getTestDb();
    const fakeId =
      "00000000-0000-0000-0000-000000000000" as QualificationVersionId;
    const tree = await getTopicTree(db, fakeId);
    expect(tree).toEqual([]);
  });

  it("handles deeply nested topic trees", async () => {
    const db = getTestDb();
    const deepSeed: QualificationSeed = {
      subject: { name: "CompSci", slug: "compsci" },
      examBoard: { name: "OCR", code: "OCR" },
      level: "GCSE",
      versionCode: "J277",
      firstExamYear: 2020,
      components: [
        {
          name: "Paper 1",
          code: "J277/01",
          weightPercent: 50,
          isExam: true,
        },
      ],
      topics: [
        {
          name: "Level 0",
          code: "L0",
          children: [
            {
              name: "Level 1",
              code: "L1",
              children: [
                {
                  name: "Level 2",
                  code: "L2",
                  children: [
                    {
                      name: "Level 3",
                      code: "L3",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      commandWords: [
        { word: "Define", definition: "State the meaning.", expectedDepth: 1 },
      ],
      questionTypes: [{ name: "Short answer" }],
    };

    const result = await loadQualification(db, deepSeed);
    expect(result.topicsCreated).toBe(4);

    const qvId = result.qualificationVersionId as QualificationVersionId;
    const tree = await getTopicTree(db, qvId);

    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
    expect(tree[0].children[0].children[0].children[0].depth).toBe(3);
    expect(tree[0].children[0].children[0].children[0].code).toBe("L3");
  });

  it("works correctly with the full GCSE Biology seed", async () => {
    const db = getTestDb();
    const loadResult = await loadQualification(
      db,
      seedJson as QualificationSeed
    );
    const qvId = loadResult.qualificationVersionId as QualificationVersionId;

    const tree = await getTopicTree(db, qvId);

    // 7 top-level units
    expect(tree).toHaveLength(7);

    // Verify unit names match spec
    const unitNames = tree.map((n) => n.name);
    expect(unitNames).toContain("Cell Biology");
    expect(unitNames).toContain("Organisation");
    expect(unitNames).toContain("Infection and Response");
    expect(unitNames).toContain("Bioenergetics");
    expect(unitNames).toContain("Homeostasis and Response");
    expect(unitNames).toContain("Inheritance, Variation and Evolution");
    expect(unitNames).toContain("Ecology");

    // Cell Biology should have 3 sub-topics
    const cellBiology = tree.find((n) => n.code === "4.1")!;
    expect(cellBiology.children).toHaveLength(3);

    // Each sub-topic should have deeper children
    const cellStructure = cellBiology.children.find(
      (n) => n.code === "4.1.1"
    )!;
    expect(cellStructure.children.length).toBeGreaterThan(0);

    // Cell Division should have prerequisite edge to Cell Structure
    const cellDivision = cellBiology.children.find(
      (n) => n.code === "4.1.2"
    )!;
    expect(cellDivision.edges).toHaveLength(1);
    expect(cellDivision.edges[0].edgeType).toBe("prerequisite");
    expect(cellDivision.edges[0].toTopicId).toBe(cellStructure.id);

    // Check total topic count across all levels
    function countNodes(nodes: TopicTreeNode[]): number {
      return nodes.reduce(
        (sum, node) => sum + 1 + countNodes(node.children),
        0
      );
    }
    const totalTopics = countNodes(tree);
    expect(totalTopics).toBe(loadResult.topicsCreated);
  });

  it("root nodes have no edges unless specified", async () => {
    const db = getTestDb();
    const loadResult = await loadQualification(db, minimalSeed);
    const qvId = loadResult.qualificationVersionId as QualificationVersionId;

    const tree = await getTopicTree(db, qvId);

    // Root nodes in minimalSeed have no edges
    for (const root of tree) {
      expect(root.edges).toEqual([]);
    }
  });
});

describe("seed data validation", () => {
  it("rejects seed with missing required fields", async () => {
    const db = getTestDb();
    const invalidSeed = {
      subject: { name: "Biology", slug: "biology" },
      // missing examBoard, level, versionCode, etc.
    };

    await expect(
      loadQualification(db, invalidSeed as QualificationSeed)
    ).rejects.toThrow("Invalid seed data");
  });

  it("rejects seed with empty topics array", async () => {
    const db = getTestDb();
    const invalidSeed: QualificationSeed = {
      ...minimalSeed,
      subject: { name: "Empty", slug: "empty" },
      versionCode: "0000",
      topics: [],
    };

    await expect(loadQualification(db, invalidSeed)).rejects.toThrow(
      "Invalid seed data"
    );
  });

  it("rejects seed with empty components array", async () => {
    const db = getTestDb();
    const invalidSeed: QualificationSeed = {
      ...minimalSeed,
      subject: { name: "NoComp", slug: "nocomp" },
      versionCode: "0001",
      components: [],
    };

    await expect(loadQualification(db, invalidSeed)).rejects.toThrow(
      "Invalid seed data"
    );
  });

  it("rejects seed with invalid edge type", async () => {
    const invalidSeed = {
      ...minimalSeed,
      subject: { name: "BadEdge", slug: "badedge" },
      versionCode: "0002",
      topics: [
        {
          name: "Topic A",
          code: "A",
          edges: [{ toCode: "B", type: "invalid_type" }],
        },
        { name: "Topic B", code: "B" },
      ],
    };

    const db = getTestDb();
    await expect(
      loadQualification(db, invalidSeed as unknown as QualificationSeed)
    ).rejects.toThrow("Invalid seed data");
  });

  it("rejects seed with empty command words array", async () => {
    const db = getTestDb();
    const invalidSeed: QualificationSeed = {
      ...minimalSeed,
      subject: { name: "NoCW", slug: "nocw" },
      versionCode: "0003",
      commandWords: [],
    };

    await expect(loadQualification(db, invalidSeed)).rejects.toThrow(
      "Invalid seed data"
    );
  });

  it("validates the real GCSE Biology seed against the schema", () => {
    const result = qualificationSeedSchema.safeParse(seedJson);
    expect(result.success).toBe(true);
  });
});
