import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  return NextResponse.json({
    data: {
      user: ctx.user,
      roles: ctx.roles,
    },
  });
}
