import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { structuredLog } from "@/lib/logger";
import {
  getInAppNotifications,
  markNotificationRead,
} from "@/engine/notifications";

const markReadSchema = z.object({
  notificationId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof requireAuth>>;
  try {
    ctx = await requireAuth();
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }
    throw error;
  }

  const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50;

  const notifications = await getInAppNotifications(db, ctx.user.id, {
    unreadOnly,
    limit,
  });

  structuredLog("notifications.list", {
    userId: ctx.user.id,
    count: notifications.length,
    unreadOnly,
  });

  return NextResponse.json({ data: notifications });
}

export async function PATCH(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof requireAuth>>;
  try {
    ctx = await requireAuth();
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }
    throw error;
  }

  const body: unknown = await request.json();
  const parsed = markReadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0].message,
        },
      },
      { status: 400 },
    );
  }

  const updated = await markNotificationRead(
    db,
    parsed.data.notificationId,
    ctx.user.id,
  );

  if (!updated) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Notification not found" } },
      { status: 404 },
    );
  }

  structuredLog("notifications.read", {
    userId: ctx.user.id,
    notificationId: parsed.data.notificationId,
  });

  return NextResponse.json({ data: { success: true } });
}
