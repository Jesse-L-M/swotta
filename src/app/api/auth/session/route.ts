import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createSessionCookie, verifyIdToken } from "@/lib/auth";

const sessionSchema = z.object({
  idToken: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = sessionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body" } },
      { status: 400 }
    );
  }

  const decoded = await verifyIdToken(parsed.data.idToken);
  if (!decoded) {
    return NextResponse.json(
      { error: { code: "INVALID_TOKEN", message: "Invalid Firebase ID token" } },
      { status: 401 }
    );
  }

  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  const sessionCookie = await createSessionCookie(parsed.data.idToken, expiresIn);

  const cookieStore = await cookies();
  cookieStore.set("__session", sessionCookie, {
    maxAge: expiresIn / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
  });

  return NextResponse.json({ data: { uid: decoded.uid } });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("__session");
  return NextResponse.json({ data: { success: true } });
}
