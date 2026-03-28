import { eq, sql, and } from "drizzle-orm";
import { type Database } from "@/lib/db";
import { legacyQualificationSeedSchema } from "@/curriculum/legacy";
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
import type {
  QualificationSeed,
  QualificationVersionId,
  TopicId,
  TopicSeedNode,
  TopicTreeNode,
} from "@/lib/types";

export const qualificationSeedSchema = legacyQualificationSeedSchema;

export interface LoadQualificationResult {
  qualificationVersionId: string;
  topicsCreated: number;
  componentsCreated: number;
  edgesCreated: number;
}

export async function loadQualification(
  db: Database,
  seedData: QualificationSeed
): Promise<LoadQualificationResult> {
  const parsed = qualificationSeedSchema.safeParse(seedData);
  if (!parsed.success) {
    throw new Error(
      `Invalid seed data: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }

  return await db.transaction(async (tx) => {
    // 1. Upsert exam board
    const [board] = await tx
      .insert(examBoards)
      .values({
        name: seedData.examBoard.name,
        code: seedData.examBoard.code,
        country: "GB",
      })
      .onConflictDoNothing({ target: examBoards.code })
      .returning();
    const boardRow =
      board ??
      (
        await tx
          .select()
          .from(examBoards)
          .where(eq(examBoards.code, seedData.examBoard.code))
      )[0];

    // 2. Upsert subject
    const [subj] = await tx
      .insert(subjects)
      .values({
        name: seedData.subject.name,
        slug: seedData.subject.slug,
      })
      .onConflictDoNothing({ target: subjects.slug })
      .returning();
    const subjRow =
      subj ??
      (
        await tx
          .select()
          .from(subjects)
          .where(eq(subjects.slug, seedData.subject.slug))
      )[0];

    // 3. Upsert qualification
    const [qual] = await tx
      .insert(qualifications)
      .values({
        subjectId: subjRow.id,
        level: seedData.level as typeof qualifications.$inferInsert.level,
        name: `${seedData.level} ${seedData.subject.name}`,
      })
      .onConflictDoNothing()
      .returning();
    const qualRow =
      qual ??
      (
        await tx
          .select()
          .from(qualifications)
          .where(
            and(
              eq(qualifications.subjectId, subjRow.id),
              eq(
                qualifications.level,
                seedData.level as typeof qualifications.$inferInsert.level
              )
            )
          )
      )[0];

    // 4. Upsert qualification version
    const [version] = await tx
      .insert(qualificationVersions)
      .values({
        qualificationId: qualRow.id,
        examBoardId: boardRow.id,
        versionCode: seedData.versionCode,
        firstExamYear: seedData.firstExamYear,
        specUrl: seedData.specUrl ?? null,
        totalMarks:
          seedData.components.reduce(
            (sum, c) => sum + (c.totalMarks ?? 0),
            0
          ) || null,
      })
      .onConflictDoNothing()
      .returning();
    const versionRow =
      version ??
      (
        await tx
          .select()
          .from(qualificationVersions)
          .where(
            and(
              eq(qualificationVersions.qualificationId, qualRow.id),
              eq(qualificationVersions.examBoardId, boardRow.id),
              eq(qualificationVersions.versionCode, seedData.versionCode)
            )
          )
      )[0];

    const qvId = versionRow.id;

    // If version already existed, check for existing data and skip if populated
    const existingTopics = await tx
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.qualificationVersionId, qvId))
      .limit(1);

    if (existingTopics.length > 0) {
      return {
        qualificationVersionId: qvId,
        topicsCreated: 0,
        componentsCreated: 0,
        edgesCreated: 0,
      };
    }

    // 5. Insert assessment components
    let componentsCreated = 0;
    for (const comp of seedData.components) {
      await tx.insert(assessmentComponents).values({
        qualificationVersionId: qvId,
        name: comp.name,
        code: comp.code,
        weightPercent: comp.weightPercent,
        durationMinutes: comp.durationMinutes ?? null,
        totalMarks: comp.totalMarks ?? null,
        isExam: comp.isExam,
      });
      componentsCreated++;
    }

    // 6. Insert topics recursively, collecting code→id map for edges
    const topicCodeToId = new Map<string, string>();
    let topicsCreated = 0;

    async function insertTopicsRecursive(
      nodes: TopicSeedNode[],
      parentId: string | null,
      depth: number
    ): Promise<void> {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const [inserted] = await tx
          .insert(topics)
          .values({
            qualificationVersionId: qvId,
            parentTopicId: parentId,
            name: node.name,
            code: node.code ?? null,
            depth,
            sortOrder: i + 1,
            description: node.description ?? null,
            estimatedHours: node.estimatedHours?.toString() ?? null,
          })
          .returning();

        topicsCreated++;
        if (node.code) {
          topicCodeToId.set(node.code, inserted.id);
        }

        if (node.children && node.children.length > 0) {
          await insertTopicsRecursive(node.children, inserted.id, depth + 1);
        }
      }
    }

    await insertTopicsRecursive(seedData.topics, null, 0);

    // 7. Insert topic edges (resolve codes to IDs)
    let edgesCreated = 0;

    function collectEdges(
      nodes: TopicSeedNode[]
    ): Array<{
      fromCode: string;
      toCode: string;
      type: "prerequisite" | "builds_on" | "related";
    }> {
      const edges: Array<{
        fromCode: string;
        toCode: string;
        type: "prerequisite" | "builds_on" | "related";
      }> = [];
      for (const node of nodes) {
        if (node.edges && node.code) {
          for (const edge of node.edges) {
            edges.push({
              fromCode: node.code,
              toCode: edge.toCode,
              type: edge.type,
            });
          }
        }
        if (node.children) {
          edges.push(...collectEdges(node.children));
        }
      }
      return edges;
    }

    const allEdges = collectEdges(seedData.topics);
    for (const edge of allEdges) {
      const fromId = topicCodeToId.get(edge.fromCode);
      const toId = topicCodeToId.get(edge.toCode);
      if (fromId && toId) {
        await tx.insert(topicEdges).values({
          fromTopicId: fromId,
          toTopicId: toId,
          edgeType: edge.type,
        });
        edgesCreated++;
      }
    }

    // 8. Insert command words
    for (const cw of seedData.commandWords) {
      await tx.insert(commandWords).values({
        qualificationVersionId: qvId,
        word: cw.word,
        definition: cw.definition,
        expectedDepth: cw.expectedDepth,
      });
    }

    // 9. Insert question types
    for (const qt of seedData.questionTypes) {
      await tx.insert(questionTypes).values({
        qualificationVersionId: qvId,
        name: qt.name,
        description: qt.description ?? null,
        typicalMarks: qt.typicalMarks ?? null,
        markSchemePattern: qt.markSchemePattern ?? null,
      });
    }

    // 10. Insert misconception rules
    if (seedData.misconceptionRules) {
      for (const mr of seedData.misconceptionRules) {
        const topicId = topicCodeToId.get(mr.topicCode);
        if (topicId) {
          await tx.insert(misconceptionRules).values({
            topicId,
            description: mr.description,
            triggerPatterns: mr.triggerPatterns,
            correctionGuidance: mr.correctionGuidance,
            severity: mr.severity ?? 2,
          });
        }
      }
    }

    return {
      qualificationVersionId: qvId,
      topicsCreated,
      componentsCreated,
      edgesCreated,
    };
  });
}

export async function getTopicTree(
  db: Database,
  qualificationVersionId: QualificationVersionId
): Promise<TopicTreeNode[]> {
  // Recursive CTE to load the full topic tree in a single query
  const rows = await db.execute<{
    id: string;
    name: string;
    code: string | null;
    depth: number;
    sort_order: number;
    parent_topic_id: string | null;
  }>(sql`
    WITH RECURSIVE topic_tree AS (
      SELECT id, name, code, depth, sort_order, parent_topic_id
      FROM topics
      WHERE qualification_version_id = ${qualificationVersionId}
        AND parent_topic_id IS NULL
      UNION ALL
      SELECT t.id, t.name, t.code, t.depth, t.sort_order, t.parent_topic_id
      FROM topics t
      JOIN topic_tree tt ON t.parent_topic_id = tt.id
    )
    SELECT * FROM topic_tree ORDER BY depth, sort_order
  `);

  // Load all edges for topics in this qualification version
  const edgeRows = await db.execute<{
    from_topic_id: string;
    to_topic_id: string;
    edge_type: "prerequisite" | "builds_on" | "related";
  }>(sql`
    SELECT te.from_topic_id, te.to_topic_id, te.edge_type
    FROM topic_edges te
    JOIN topics t ON te.from_topic_id = t.id
    WHERE t.qualification_version_id = ${qualificationVersionId}
  `);

  // Build edge lookup: fromTopicId → edges[]
  const edgeMap = new Map<
    string,
    Array<{
      toTopicId: TopicId;
      edgeType: "prerequisite" | "builds_on" | "related";
    }>
  >();
  for (const edge of edgeRows) {
    const list = edgeMap.get(edge.from_topic_id) ?? [];
    list.push({
      toTopicId: edge.to_topic_id as TopicId,
      edgeType: edge.edge_type,
    });
    edgeMap.set(edge.from_topic_id, list);
  }

  // Build tree from flat results
  const nodeMap = new Map<string, TopicTreeNode>();
  const roots: TopicTreeNode[] = [];

  for (const row of rows) {
    const node: TopicTreeNode = {
      id: row.id as TopicId,
      name: row.name,
      code: row.code,
      depth: row.depth,
      children: [],
      edges: edgeMap.get(row.id) ?? [],
    };
    nodeMap.set(row.id, node);

    if (row.parent_topic_id === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(row.parent_topic_id);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  return roots;
}
