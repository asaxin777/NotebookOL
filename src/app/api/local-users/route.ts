import { NextRequest, NextResponse } from "next/server";
import {
  currentLocalUser,
  listLocalUsers,
  updateLocalUserRole,
} from "@/lib/local-db";
import type { LocalAccount } from "@/lib/local-auth-types";

function originIsAllowed(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) return true;
  if (!host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host && originUrl.protocol === new URL(request.url).protocol;
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await currentLocalUser();
  if (!user) return NextResponse.json({ error: "請先登入。" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "需要管理員權限。" }, { status: 403 });

  try {
    return NextResponse.json({ users: listLocalUsers() satisfies LocalAccount[] });
  } catch (error) {
    console.error("Local user list failed:", error);
    return NextResponse.json({ error: "無法載入帳號清單。" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "不允許的來源。" }, { status: 403 });
  }
  const user = await currentLocalUser();
  if (!user) return NextResponse.json({ error: "請先登入。" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "需要管理員權限。" }, { status: 403 });

  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "帳號資料格式無效。" }, { status: 400 });
    }
    const body = payload as Record<string, unknown>;
    if (typeof body.userId !== "string") {
      return NextResponse.json({ error: "請指定帳號。" }, { status: 400 });
    }
    updateLocalUserRole(user.id, body.userId, body.role);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新帳號權限失敗。";
    const status = message.includes("找不到") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
