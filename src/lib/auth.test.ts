import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "@/test/setup";
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestLearner,
  createTestGuardianLink,
} from "@/test/fixtures";
import type { Database } from "@/lib/db";
import { createE2ESessionCookie } from "@/lib/e2e-auth";

// Mock Firebase Admin SDK
vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(() => ({ name: "test-app" })),
  getApps: vi.fn(() => []),
  cert: vi.fn((config) => config),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({
    verifySessionCookie: vi.fn(),
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock("@/lib/db", () => ({
  db: null as unknown,
}));

describe("auth module", () => {
  let db: Database;

  beforeEach(() => {
    db = getTestDb() as unknown as Database;
    vi.clearAllMocks();
    delete process.env.E2E_AUTH_BYPASS_SECRET;
  });

  describe("AuthError", () => {
    it("creates error with correct code and message", async () => {
      const { AuthError } = await import("@/lib/auth");
      const err = new AuthError("UNAUTHENTICATED", "test message");
      expect(err.code).toBe("UNAUTHENTICATED");
      expect(err.message).toBe("test message");
      expect(err.name).toBe("AuthError");
    });

    it("supports FORBIDDEN code", async () => {
      const { AuthError } = await import("@/lib/auth");
      const err = new AuthError("FORBIDDEN", "not allowed");
      expect(err.code).toBe("FORBIDDEN");
    });

    it("supports INVALID_TOKEN code", async () => {
      const { AuthError } = await import("@/lib/auth");
      const err = new AuthError("INVALID_TOKEN", "bad token");
      expect(err.code).toBe("INVALID_TOKEN");
    });
  });

  describe("getFirebaseAdmin", () => {
    it("returns an admin app instance", async () => {
      const { getFirebaseAdmin } = await import("@/lib/auth");
      const app = getFirebaseAdmin();
      expect(app).toBeDefined();
    });
  });

  describe("verifySessionCookie", () => {
    it("accepts signed e2e session cookies when the bypass secret is configured", async () => {
      process.env.E2E_AUTH_BYPASS_SECRET = "test-e2e-secret";

      const { verifySessionCookie } = await import("@/lib/auth");
      const sessionCookie = createE2ESessionCookie("student");
      const result = await verifySessionCookie(sessionCookie!);

      expect(result?.uid).toBe("e2e-test-student");
    });

    it("returns null on invalid cookie", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn().mockRejectedValue(new Error("invalid")),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { verifySessionCookie } = await import("@/lib/auth");
      const result = await verifySessionCookie("bad-cookie");
      expect(result).toBeNull();
    });

    it("rejects unsigned legacy e2e cookie values", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn().mockRejectedValue(new Error("invalid")),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { verifySessionCookie } = await import("@/lib/auth");
      const result = await verifySessionCookie("e2e-test-student-session");
      expect(result).toBeNull();
    });

    it("rejects tampered signed e2e session cookies", async () => {
      process.env.E2E_AUTH_BYPASS_SECRET = "test-e2e-secret";

      const { verifySessionCookie } = await import("@/lib/auth");
      const sessionCookie = createE2ESessionCookie("student");
      const tamperedCookie = `${sessionCookie}tampered`;
      const result = await verifySessionCookie(tamperedCookie);

      expect(result).toBeNull();
    });

    it("returns decoded token on valid cookie", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const decoded = { uid: "test-uid", email: "test@example.com" };
      const mockAuth = {
        verifySessionCookie: vi.fn().mockResolvedValue(decoded),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { verifySessionCookie } = await import("@/lib/auth");
      const result = await verifySessionCookie("valid-cookie");
      expect(result).toEqual(decoded);
    });
  });

  describe("verifyIdToken", () => {
    it("returns null on invalid token", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn(),
        verifyIdToken: vi.fn().mockRejectedValue(new Error("invalid")),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { verifyIdToken } = await import("@/lib/auth");
      const result = await verifyIdToken("bad-token");
      expect(result).toBeNull();
    });

    it("returns decoded token on valid token", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const decoded = { uid: "test-uid", email: "test@example.com" };
      const mockAuth = {
        verifySessionCookie: vi.fn(),
        verifyIdToken: vi.fn().mockResolvedValue(decoded),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { verifyIdToken } = await import("@/lib/auth");
      const result = await verifyIdToken("valid-token");
      expect(result).toEqual(decoded);
    });
  });

  describe("createSessionCookie", () => {
    it("delegates to Firebase Admin", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn(),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn().mockResolvedValue("session-cookie-value"),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { createSessionCookie } = await import("@/lib/auth");
      const cookie = await createSessionCookie("id-token", 60000);
      expect(cookie).toBe("session-cookie-value");
      expect(mockAuth.createSessionCookie).toHaveBeenCalledWith("id-token", {
        expiresIn: 60000,
      });
    });
  });

  describe("getAuthContextFromToken", () => {
    it("returns null for invalid token", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn(),
        verifyIdToken: vi.fn().mockRejectedValue(new Error("invalid")),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { getAuthContextFromToken } = await import("@/lib/auth");
      const result = await getAuthContextFromToken("bad-token", db);
      expect(result).toBeNull();
    });

    it("returns null when user not in DB", async () => {
      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn(),
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "nonexistent-uid" }),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { getAuthContextFromToken } = await import("@/lib/auth");
      const result = await getAuthContextFromToken("valid-token", db);
      expect(result).toBeNull();
    });

    it("returns auth context for valid user", async () => {
      const org = await createTestOrg();
      const user = await createTestUser({ firebaseUid: "test-firebase-uid" });
      await createTestMembership(user.id, org.id, "learner");

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn(),
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "test-firebase-uid" }),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { getAuthContextFromToken } = await import("@/lib/auth");
      const result = await getAuthContextFromToken("valid-token", db);

      expect(result).not.toBeNull();
      expect(result!.user.id).toBe(user.id);
      expect(result!.user.firebaseUid).toBe("test-firebase-uid");
      expect(result!.roles).toHaveLength(1);
      expect(result!.roles[0].role).toBe("learner");
    });

    it("returns multiple roles for multi-role user", async () => {
      const org = await createTestOrg();
      const user = await createTestUser({ firebaseUid: "multi-role-uid" });
      await createTestMembership(user.id, org.id, "learner");
      await createTestMembership(user.id, org.id, "org_owner");

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn(),
        verifyIdToken: vi.fn().mockResolvedValue({ uid: "multi-role-uid" }),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { getAuthContextFromToken } = await import("@/lib/auth");
      const result = await getAuthContextFromToken("valid-token", db);
      expect(result!.roles).toHaveLength(2);
    });
  });

  describe("requireAuth", () => {
    it("throws AuthError when no session cookie", async () => {
      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
        delete: vi.fn(),
      } as unknown as Awaited<ReturnType<typeof cookies>>);

      const { requireAuth, AuthError } = await import("@/lib/auth");
      await expect(requireAuth(db)).rejects.toThrow(AuthError);
    });
  });

  describe("requireRole", () => {
    it("throws when user lacks required role", async () => {
      const org = await createTestOrg();
      const user = await createTestUser({ firebaseUid: "role-test-uid" });
      await createTestMembership(user.id, org.id, "learner");

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn().mockResolvedValue({ uid: "role-test-uid" }),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session" }),
        set: vi.fn(),
        delete: vi.fn(),
      } as unknown as Awaited<ReturnType<typeof cookies>>);

      const { requireRole, AuthError } = await import("@/lib/auth");
      await expect(requireRole("guardian", db)).rejects.toThrow(AuthError);
    });
  });

  describe("requireLearner", () => {
    it("throws when user has no learner profile", async () => {
      const org = await createTestOrg();
      const user = await createTestUser({ firebaseUid: "learner-test-uid" });
      await createTestMembership(user.id, org.id, "learner");

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn().mockResolvedValue({ uid: "learner-test-uid" }),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session" }),
        set: vi.fn(),
        delete: vi.fn(),
      } as unknown as Awaited<ReturnType<typeof cookies>>);

      const { requireLearner, AuthError } = await import("@/lib/auth");
      await expect(requireLearner(db)).rejects.toThrow(AuthError);
    });

    it("returns learnerId when learner profile exists", async () => {
      const org = await createTestOrg();
      const user = await createTestUser({ firebaseUid: "with-learner-uid" });
      // createTestLearner internally creates a learner membership
      const learner = await createTestLearner(org.id, { userId: user.id });

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn().mockResolvedValue({ uid: "with-learner-uid" }),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session" }),
        set: vi.fn(),
        delete: vi.fn(),
      } as unknown as Awaited<ReturnType<typeof cookies>>);

      const { requireLearner } = await import("@/lib/auth");
      const result = await requireLearner(db);
      expect(result.learnerId).toBe(learner.id);
      expect(result.orgId).toBe(org.id);
    });
  });

  describe("requireGuardian", () => {
    it("returns linked learner IDs", async () => {
      const org = await createTestOrg();
      const guardianUser = await createTestUser({ firebaseUid: "guardian-uid" });
      await createTestMembership(guardianUser.id, org.id, "guardian");
      const learner = await createTestLearner(org.id);
      await createTestGuardianLink(guardianUser.id, learner.id);

      const { getAuth } = await import("firebase-admin/auth");
      const mockAuth = {
        verifySessionCookie: vi.fn().mockResolvedValue({ uid: "guardian-uid" }),
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
      };
      vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);

      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-session" }),
        set: vi.fn(),
        delete: vi.fn(),
      } as unknown as Awaited<ReturnType<typeof cookies>>);

      const { requireGuardian } = await import("@/lib/auth");
      const result = await requireGuardian(db);
      expect(result.linkedLearnerIds).toContain(learner.id);
    });
  });
});
