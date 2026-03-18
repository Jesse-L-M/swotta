import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { learners, guardianLinks, memberships, users } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";

const linkSchema = z.object({
  inviteCode: z.string().uuid("Invalid invite code format"),
  relationship: z.string().min(1).max(50).default("parent"),
});

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

  const { inviteCode, relationship } = parsed.data;

  // Invite code is the learner's ID (in a real product, use a short code + lookup table)
  const [learner] = await db
    .select({ id: learners.id, orgId: learners.orgId })
    .from(learners)
    .where(eq(learners.id, inviteCode))
    .limit(1);

  if (!learner) {
    return NextResponse.json(
      { error: { code: "INVALID_CODE", message: "Invalid invite code" } },
      { status: 404 }
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
    // Create guardian link
    await tx.insert(guardianLinks).values({
      guardianUserId: ctx.user.id,
      learnerId: learner.id,
      relationship,
    });

    // Ensure guardian has membership in the learner's org
    const [existingMembership] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, ctx.user.id),
          eq(memberships.orgId, learner.orgId),
          eq(memberships.role, "guardian")
        )
      )
      .limit(1);

    if (!existingMembership) {
      await tx.insert(memberships).values({
        userId: ctx.user.id,
        orgId: learner.orgId,
        role: "guardian",
      });
    }
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
