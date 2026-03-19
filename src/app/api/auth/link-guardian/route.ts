import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { learners, guardianLinks, memberships } from "@/db/schema";
import { AuthError, requireRole } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";

const linkSchema = z
  .object({
    inviteCode: z.string().uuid("Invalid invite code format").optional(),
    learnerId: z.string().uuid("Invalid learner ID format").optional(),
    relationship: z
      .string()
      .trim()
      .min(1, "Relationship is required")
      .max(50, "Relationship must be 50 characters or fewer")
      .default("parent"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.inviteCode && !data.learnerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inviteCode"],
        message: "inviteCode is required",
      });
    }

    if (data.inviteCode && data.learnerId && data.inviteCode !== data.learnerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inviteCode"],
        message: "inviteCode and learnerId must match when both are provided",
      });
    }
  });

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireRole("guardian");
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    throw error;
  }

  const body = await request.json();
  const parsed = linkSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
      { status: 400 }
    );
  }

  const { inviteCode, learnerId, relationship } = parsed.data;
  const learnerLookupId = inviteCode ?? learnerId;

  const [learner] = await db
    .select({ id: learners.id, orgId: learners.orgId, userId: learners.userId })
    .from(learners)
    .where(eq(learners.id, learnerLookupId!))
    .limit(1);

  if (!learner) {
    return NextResponse.json(
      { error: { code: "INVALID_CODE", message: "Invalid invite code" } },
      { status: 404 }
    );
  }

  if (learner.userId === ctx.user.id) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Cannot link yourself as guardian",
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

  await db.transaction(async (tx) => {
    await tx.insert(guardianLinks).values({
      guardianUserId: ctx.user.id,
      learnerId: learner.id,
      relationship,
    });

    await tx
      .insert(memberships)
      .values({
        userId: ctx.user.id,
        orgId: learner.orgId,
        role: "guardian",
      })
      .onConflictDoNothing();
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
