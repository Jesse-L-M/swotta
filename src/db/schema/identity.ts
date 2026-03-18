import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  boolean,
  integer,
  date,
  unique,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  orgTypeEnum,
  roleTypeEnum,
  policyScopeEnum,
  learnerQualStatusEnum,
} from "./enums";
import { subjects, qualificationVersions } from "./curriculum";

// --- organizations ---

export const organizations = pgTable("organizations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  type: orgTypeEnum("type").notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- users ---

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    firebaseUid: varchar("firebase_uid", { length: 255 }).unique().notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_firebase_uid_idx").on(table.firebaseUid)]
);

// --- memberships ---

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    role: roleTypeEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("memberships_user_org_role_unique").on(
      table.userId,
      table.orgId,
      table.role
    ),
  ]
);

// --- learners ---

export const learners = pgTable("learners", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .unique()
    .notNull()
    .references(() => users.id),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  yearGroup: integer("year_group"),
  dateOfBirth: date("date_of_birth"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- guardian_links ---

export const guardianLinks = pgTable(
  "guardian_links",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => users.id),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    relationship: varchar("relationship", { length: 50 }).notNull(),
    receivesWeeklyReport: boolean("receives_weekly_report")
      .notNull()
      .default(true),
    receivesFlags: boolean("receives_flags").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("guardian_links_guardian_learner_unique").on(
      table.guardianUserId,
      table.learnerId
    ),
  ]
);

// --- staff_profiles ---

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    title: varchar("title", { length: 255 }),
    department: varchar("department", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("staff_profiles_user_org_unique").on(table.userId, table.orgId),
  ]
);

// --- classes ---
// subjects and qualification_versions FKs use AnyPgColumn to avoid circular imports

export const classes = pgTable("classes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  name: varchar("name", { length: 255 }).notNull(),
  subjectId: uuid("subject_id").references(
    (): AnyPgColumn => subjects.id
  ),
  qualificationVersionId: uuid("qualification_version_id").references(
    (): AnyPgColumn => qualificationVersions.id
  ),
  yearGroup: integer("year_group"),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  teacherUserId: uuid("teacher_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- cohorts ---

export const cohorts = pgTable("cohorts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- enrollments ---

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    cohortId: uuid("cohort_id").references(() => cohorts.id),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unenrolledAt: timestamp("unenrolled_at", { withTimezone: true }),
  },
  (table) => [
    unique("enrollments_learner_class_unique").on(
      table.learnerId,
      table.classId
    ),
  ]
);

// --- learner_qualifications ---

export const learnerQualifications = pgTable(
  "learner_qualifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    qualificationVersionId: uuid("qualification_version_id")
      .notNull()
      .references((): AnyPgColumn => qualificationVersions.id),
    targetGrade: varchar("target_grade", { length: 10 }),
    examDate: date("exam_date"),
    status: learnerQualStatusEnum("status").notNull().default("active"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("learner_qualifications_learner_qv_unique").on(
      table.learnerId,
      table.qualificationVersionId
    ),
  ]
);

// --- policies ---

export const policies = pgTable(
  "policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    scopeType: policyScopeEnum("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    key: varchar("key", { length: 100 }).notNull(),
    value: jsonb("value").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("policies_scope_key_unique").on(
      table.scopeType,
      table.scopeId,
      table.key
    ),
  ]
);
