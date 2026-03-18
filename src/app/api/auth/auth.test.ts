import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestLearner,
  createTestGuardianLink,
} from "@/test/fixtures";
import { users, organizations, memberships, learners, guardianLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";

// Mock Firebase Admin
vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(() => ({ name: "test-app" })),
  getApps: vi.fn(() => []),
  cert: vi.fn((config) => config),
}));

vi.mock("firebase-admin/auth", () => {
  const verifyIdToken = vi.fn();
  const createSessionCookie = vi.fn();
  const verifySessionCookie = vi.fn();
  return {
    getAuth: vi.fn(() => ({
      verifyIdToken,
      createSessionCookie,
      verifySessionCookie,
    })),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock("@/lib/db", async () => {
  const { getTestDb } = await import("@/test/setup");
  return { db: getTestDb() };
});

describe("auth API routes", () => {
  let db: Database;

  beforeEach(() => {
    db = getTestDb() as unknown as Database;
    vi.clearAllMocks();
  });

  describe("POST /api/auth/signup", () => {
    it("creates user, org, and membership for learner signup", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = vi.mocked(getAuth)();
      vi.mocked(mockAuth.verifyIdToken).mockResolvedValue({
        uid: "new-learner-uid",
        email: "learner@example.com",
        picture: "https://example.com/photo.jpg",
      } as ReturnType<typeof mockAuth.verifyIdToken> extends Promise<infer T> ? T : never);

      const { POST } = await import("@/app/api/auth/signup/route");
      const request = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: "valid-token",
          name: "Test Learner",
          role: "learner",
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.data.userId).toBeDefined();
      expect(data.data.orgId).toBeDefined();
      expect(data.data.learnerId).toBeDefined();

      // Verify user was created
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, "new-learner-uid"))
        .limit(1);
      expect(user).toBeDefined();
      expect(user.email).toBe("learner@example.com");
      expect(user.name).toBe("Test Learner");

      // Verify org was created
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, data.data.orgId))
        .limit(1);
      expect(org).toBeDefined();
      expect(org.type).toBe("household");

      // Verify memberships (learner + org_owner)
      const userMemberships = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, data.data.userId));
      expect(userMemberships).toHaveLength(2);
      const roles = userMemberships.map((m) => m.role).sort();
      expect(roles).toEqual(["learner", "org_owner"]);

      // Verify learner record
      const [learner] = await db
        .select()
        .from(learners)
        .where(eq(learners.id, data.data.learnerId))
        .limit(1);
      expect(learner).toBeDefined();
      expect(learner.displayName).toBe("Test Learner");
    });

    it("creates user and org for guardian signup without learner record", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = vi.mocked(getAuth)();
      vi.mocked(mockAuth.verifyIdToken).mockResolvedValue({
        uid: "new-guardian-uid",
        email: "parent@example.com",
      } as ReturnType<typeof mockAuth.verifyIdToken> extends Promise<infer T> ? T : never);

      const { POST } = await import("@/app/api/auth/signup/route");
      const request = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: "valid-token",
          name: "Test Parent",
          role: "guardian",
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.data.userId).toBeDefined();
      expect(data.data.learnerId).toBeNull();
    });

    it("rejects duplicate signup", async () => {
      await createTestUser({ firebaseUid: "existing-uid" });

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = vi.mocked(getAuth)();
      vi.mocked(mockAuth.verifyIdToken).mockResolvedValue({
        uid: "existing-uid",
        email: "test@example.com",
      } as ReturnType<typeof mockAuth.verifyIdToken> extends Promise<infer T> ? T : never);

      const { POST } = await import("@/app/api/auth/signup/route");
      const request = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: "valid-token",
          name: "Duplicate User",
          role: "learner",
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(409);
    });

    it("rejects invalid token", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = vi.mocked(getAuth)();
      vi.mocked(mockAuth.verifyIdToken).mockRejectedValue(new Error("invalid"));

      const { POST } = await import("@/app/api/auth/signup/route");
      const request = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: "bad-token",
          name: "Test",
          role: "learner",
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(401);
    });

    it("rejects invalid request body", async () => {
      const { POST } = await import("@/app/api/auth/signup/route");
      const request = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: "" }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/link-guardian", () => {
    it("links guardian to learner", async () => {
      const org = await createTestOrg();
      const guardian = await createTestUser({ firebaseUid: "guardian-link-uid" });
      await createTestMembership(guardian.id, org.id, "guardian");
      const learner = await createTestLearner(org.id);

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = vi.mocked(getAuth)();
      vi.mocked(mockAuth.verifySessionCookie).mockResolvedValue({
        uid: "guardian-link-uid",
      } as ReturnType<typeof mockAuth.verifySessionCookie> extends Promise<infer T> ? T : never);

      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session" }),
        set: vi.fn(),
        delete: vi.fn(),
      } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never);

      const { POST } = await import("@/app/api/auth/link-guardian/route");
      const request = new Request("http://localhost/api/auth/link-guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: learner.id,
          relationship: "parent",
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.learnerId).toBe(learner.id);

      // Verify link was created
      const links = await db
        .select()
        .from(guardianLinks)
        .where(eq(guardianLinks.guardianUserId, guardian.id));
      expect(links).toHaveLength(1);
      expect(links[0].learnerId).toBe(learner.id);
    });

    it("rejects duplicate link", async () => {
      const org = await createTestOrg();
      const guardian = await createTestUser({ firebaseUid: "dup-link-uid" });
      await createTestMembership(guardian.id, org.id, "guardian");
      const learner = await createTestLearner(org.id);
      await createTestGuardianLink(guardian.id, learner.id);

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = vi.mocked(getAuth)();
      vi.mocked(mockAuth.verifySessionCookie).mockResolvedValue({
        uid: "dup-link-uid",
      } as ReturnType<typeof mockAuth.verifySessionCookie> extends Promise<infer T> ? T : never);

      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session" }),
        set: vi.fn(),
        delete: vi.fn(),
      } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never);

      const { POST } = await import("@/app/api/auth/link-guardian/route");
      const request = new Request("http://localhost/api/auth/link-guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: learner.id,
          relationship: "parent",
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(409);
    });

    it("rejects invalid invite code", async () => {
      const org = await createTestOrg();
      const guardian = await createTestUser({ firebaseUid: "bad-code-uid" });
      await createTestMembership(guardian.id, org.id, "guardian");

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = vi.mocked(getAuth)();
      vi.mocked(mockAuth.verifySessionCookie).mockResolvedValue({
        uid: "bad-code-uid",
      } as ReturnType<typeof mockAuth.verifySessionCookie> extends Promise<infer T> ? T : never);

      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session" }),
        set: vi.fn(),
        delete: vi.fn(),
      } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never);

      const { POST } = await import("@/app/api/auth/link-guardian/route");
      const request = new Request("http://localhost/api/auth/link-guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: "00000000-0000-0000-0000-000000000000",
          relationship: "parent",
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(404);
    });
  });
});
