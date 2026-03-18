import { eq } from "drizzle-orm";
import {
  subjects,
  qualifications,
  qualificationVersions,
  examBoards,
} from "@/db/schema";
import type { Database } from "@/lib/db";
import type { SubjectOption, QualificationOption } from "./types";

export async function loadSubjects(db: Database): Promise<SubjectOption[]> {
  const rows = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      slug: subjects.slug,
    })
    .from(subjects)
    .orderBy(subjects.name);

  return rows;
}

export async function loadQualificationOptions(
  db: Database
): Promise<QualificationOption[]> {
  const rows = await db
    .select({
      qualificationVersionId: qualificationVersions.id,
      qualificationName: qualifications.name,
      subjectId: subjects.id,
      subjectName: subjects.name,
      examBoardCode: examBoards.code,
      examBoardName: examBoards.name,
      level: qualifications.level,
      versionCode: qualificationVersions.versionCode,
    })
    .from(qualificationVersions)
    .innerJoin(
      qualifications,
      eq(qualificationVersions.qualificationId, qualifications.id)
    )
    .innerJoin(subjects, eq(qualifications.subjectId, subjects.id))
    .innerJoin(
      examBoards,
      eq(qualificationVersions.examBoardId, examBoards.id)
    )
    .orderBy(subjects.name, examBoards.code);

  return rows;
}
