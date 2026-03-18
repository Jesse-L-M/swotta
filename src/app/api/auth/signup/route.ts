import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, organizations, memberships, learners } from "@/db/schema";
import { verifyIdToken } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { structuredLog } from "@/lib/logger";

const signupSchema = z.object({
  idToken: z.string().min(1),
  name: z.string().min(1).max(255),
  role: z.enum(["learner", "guardian"]),
});

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
      { status: 400 }
    );
  }

  const { idToken, name, role } = parsed.data;

  const decoded = await verifyIdToken(idToken);
  if (!decoded) {
    return NextResponse.json(
      { error: { code: "INVALID_TOKEN", message: "Invalid Firebase ID token" } },
      { status: 401 }
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Check inside transaction to prevent TOCTOU race
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.firebaseUid, decoded.uid))
        .limit(1);

      if (existing.length > 0) {
        return { duplicate: true as const };
      }

      // Create user
      const [user] = await tx
        .insert(users)
        .values({
          firebaseUid: decoded.uid,
          email: decoded.email ?? "",
          name,
          avatarUrl: decoded.picture ?? null,
        })
        .returning();

      // Create household organization
      const orgName = `${name}'s Household`;
      const [org] = await tx
        .insert(organizations)
        .values({
          name: orgName,
          type: "household",
          slug: generateSlug(orgName),
        })
        .returning();

      // Create membership
      await tx.insert(memberships).values({
        userId: user.id,
        orgId: org.id,
        role,
      });

      // Create org_owner membership
      await tx.insert(memberships).values({
        userId: user.id,
        orgId: org.id,
        role: "org_owner",
      });

      let learnerId: string | null = null;

      // If learner, create learner record
      if (role === "learner") {
        const [learner] = await tx
          .insert(learners)
          .values({
            userId: user.id,
            orgId: org.id,
            displayName: name,
          })
          .returning();
        learnerId = learner.id;
      }

      return { duplicate: false as const, userId: user.id, orgId: org.id, learnerId };
    });

    if (result.duplicate) {
      return NextResponse.json(
        { error: { code: "USER_EXISTS", message: "User already exists" } },
        { status: 409 }
      );
    }

    structuredLog("auth.signup", {
      userId: result.userId,
      orgId: result.orgId,
      role,
      firebaseUid: decoded.uid,
    });

    return NextResponse.json(
      { data: { userId: result.userId, orgId: result.orgId, learnerId: result.learnerId } },
      { status: 201 }
    );
  } catch (error: unknown) {
    // Handle unique constraint violation from concurrent signup
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: { code: "USER_EXISTS", message: "User already exists" } },
        { status: 409 }
      );
    }
    throw error;
  }
}
