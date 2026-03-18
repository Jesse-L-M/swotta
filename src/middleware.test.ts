import { describe, it, expect } from "vitest";
import { middleware } from "./middleware";
import { NextRequest } from "next/server";

function makeRequest(path: string, sessionCookie?: string): NextRequest {
  const url = `http://localhost:3000${path}`;
  const headers = new Headers();
  if (sessionCookie) {
    headers.set("cookie", `__session=${sessionCookie}`);
  }
  return new NextRequest(url, { headers });
}

describe("middleware", () => {
  it("allows public paths without auth", () => {
    const publicPaths = ["/", "/login", "/signup", "/api/auth/session", "/api/health"];
    for (const path of publicPaths) {
      const response = middleware(makeRequest(path));
      expect(response.status).toBe(200);
    }
  });

  it("allows api/auth/* paths without auth", () => {
    const response = middleware(makeRequest("/api/auth/signup"));
    expect(response.status).toBe(200);
  });

  it("redirects unauthenticated users from protected routes to login", () => {
    const response = middleware(makeRequest("/dashboard"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirect=%2Fdashboard");
  });

  it("allows authenticated users to access protected routes", () => {
    const response = middleware(makeRequest("/dashboard", "valid-session"));
    expect(response.status).toBe(200);
  });

  it("preserves redirect path in login URL", () => {
    const response = middleware(makeRequest("/parent/dashboard"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("redirect=%2Fparent%2Fdashboard");
  });

  it("allows _next paths without auth", () => {
    const response = middleware(makeRequest("/_next/static/chunk.js"));
    expect(response.status).toBe(200);
  });

  it("allows inngest endpoint without auth", () => {
    const response = middleware(makeRequest("/api/inngest"));
    expect(response.status).toBe(200);
  });
});
