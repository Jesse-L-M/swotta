import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, memberships, learners, guardianLinks } from "@/db/schema";
import type { Database } from "@/lib/db";

let adminApp: App | null = null;

export function getFirebaseAdmin(): App {
  if (adminApp) return adminApp;

  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });

  return adminApp;
}

export async function verifySessionCookie(
  sessionCookie: string
): Promise<DecodedIdToken | null> {
  try {
    const app = getFirebaseAdmin();
    const auth = getAuth(app);
    return await auth.verifySessionCookie(sessionCookie, true);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      JSON.stringify({ event: "auth.session-cookie-invalid", error: msg, ts: new Date().toISOString() }) + "\n"
    );
    return null;
  }
}

export async function verifyIdToken(
  idToken: string
): Promise<DecodedIdToken | null> {
  try {
    const app = getFirebaseAdmin();
    const auth = getAuth(app);
    return await auth.verifyIdToken(idToken);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      JSON.stringify({ event: "auth.id-token-invalid", error: msg, ts: new Date().toISOString() }) + "\n"
    );
    return null;
  }
}

export async function createSessionCookie(
  idToken: string,
  expiresIn: number = 60 * 60 * 24 * 5 * 1000 // 5 days
): Promise<string> {
  const app = getFirebaseAdmin();
  const auth = getAuth(app);
  return await auth.createSessionCookie(idToken, { expiresIn });
}

export interface AuthUser {
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
}

export interface AuthContext {
  user: AuthUser;
  roles: Array<{ orgId: string; role: string }>;
}

export async function getAuthContext(
  database: Database = db
): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;
  if (!sessionCookie) return null;

  const decoded = await verifySessionCookie(sessionCookie);
  if (!decoded) return null;

  const [user] = await database
    .select({
      id: users.id,
      firebaseUid: users.firebaseUid,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.firebaseUid, decoded.uid))
    .limit(1);

  if (!user) return null;

  const userMemberships = await database
    .select({ orgId: memberships.orgId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, user.id));

  return {
    user,
    roles: userMemberships,
  };
}

export async function requireAuth(
  database: Database = db
): Promise<AuthContext> {
  const ctx = await getAuthContext(database);
  if (!ctx) {
    throw new AuthError("UNAUTHENTICATED", "Authentication required");
  }
  return ctx;
}

export async function requireRole(
  role: string,
  database: Database = db
): Promise<AuthContext> {
  const ctx = await requireAuth(database);
  const hasRole = ctx.roles.some((r) => r.role === role);
  if (!hasRole) {
    throw new AuthError("FORBIDDEN", `Role '${role}' required`);
  }
  return ctx;
}

export async function requireLearner(
  database: Database = db
): Promise<AuthContext & { learnerId: string; orgId: string }> {
  const ctx = await requireRole("learner", database);
  const [learner] = await database
    .select({ id: learners.id, orgId: learners.orgId })
    .from(learners)
    .where(eq(learners.userId, ctx.user.id))
    .limit(1);

  if (!learner) {
    throw new AuthError("FORBIDDEN", "Learner profile not found");
  }

  return { ...ctx, learnerId: learner.id, orgId: learner.orgId };
}

export async function requireGuardian(
  database: Database = db
): Promise<AuthContext & { linkedLearnerIds: string[] }> {
  const ctx = await requireRole("guardian", database);

  const links = await database
    .select({ learnerId: guardianLinks.learnerId })
    .from(guardianLinks)
    .where(eq(guardianLinks.guardianUserId, ctx.user.id));

  return {
    ...ctx,
    linkedLearnerIds: links.map((l) => l.learnerId),
  };
}

export class AuthError extends Error {
  code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_TOKEN";

  constructor(
    code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_TOKEN",
    message: string
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export async function getAuthContextFromToken(
  idToken: string,
  database: Database = db
): Promise<AuthContext | null> {
  const decoded = await verifyIdToken(idToken);
  if (!decoded) return null;

  const [user] = await database
    .select({
      id: users.id,
      firebaseUid: users.firebaseUid,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.firebaseUid, decoded.uid))
    .limit(1);

  if (!user) return null;

  const userMemberships = await database
    .select({ orgId: memberships.orgId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, user.id));

  return {
    user,
    roles: userMemberships,
  };
}
