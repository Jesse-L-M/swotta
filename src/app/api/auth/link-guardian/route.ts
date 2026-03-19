import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { learners, guardianLinks } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";

const linkSchema = z
  .object({
    learnerId: z
      .string({ required_error: "learnerId is required" })
      .uuid("Invalid learner ID format"),
    relationship: z
      .string()
      .trim()
      .min(1, "Relationship is required")
      .max(50, "Relationship must be 50 characters or fewer")
      .default("parent"),
  })
  .strict();

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const parsed = linkSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
      { status: 400 }
    );
  }

  const { learnerId, relationship } = parsed.data;

  const [learner] = await db
    .select({ id: learners.id, orgId: learners.orgId, userId: learners.userId })
    .from(learners)
    .where(eq(learners.id, learnerId))
    .limit(1);

  if (!learner) {
    return NextResponse.json(
      { error: { code: "LEARNER_NOT_FOUND", message: "Learner not found" } },
      { status: 404 }
    );
  }

  const hasGuardianMembership = ctx.roles.some(
    (role) => role.orgId === learner.orgId && role.role === "guardian"
  );

  if (!hasGuardianMembership || learner.userId === ctx.user.id) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Guardian membership in the learner org is required",
        },
      },
      { status: 403 }
    );
  }

  // Check if link already exists
  const [existingLink] = await db
    .select({ id: guardianLinks.id })
    .from(guardianLinks)
    .where(
      and(
        eq(guardianLinks.guardianUserId, ctx.user.id),
        eq(guardianLinks.learnerId, learner.id)
      )
    )
    .limit(1);

  if (existingLink) {
    return NextResponse.json(
      { error: { code: "ALREADY_LINKED", message: "Already linked to this learner" } },
      { status: 409 }
    );
  }

  await db.insert(guardianLinks).values({
    guardianUserId: ctx.user.id,
    learnerId: learner.id,
    relationship,
  });

  structuredLog("auth.link-guardian", {
    guardianUserId: ctx.user.id,
    learnerId: learner.id,
    relationship,
  });

  return NextResponse.json({
    data: { learnerId: learner.id, relationship },
  });
}
