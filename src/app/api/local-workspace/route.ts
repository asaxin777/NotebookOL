import { NextRequest, NextResponse } from "next/server";
import { currentLocalUser, readLocalWorkspace, writeLocalWorkspace } from "@/lib/local-db";

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
  try {
    const user = await currentLocalUser();
    if (!user) return NextResponse.json({ error: "請先登入。" }, { status: 401 });
    return NextResponse.json(readLocalWorkspace(user.id));
  } catch (error) {
    console.error("Local workspace read failed:", error);
    return NextResponse.json({ error: "無法讀取本機資料庫。" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "不允許的來源。" }, { status: 403 });
  }
  const user = await currentLocalUser();
  if (!user) return NextResponse.json({ error: "登入已失效，請重新登入。" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 5_000_000) {
    return NextResponse.json({ error: "單次儲存資料不可超過 5 MB。" }, { status: 413 });
  }

  try {
    const payload: unknown = await request.json();
    writeLocalWorkspace(user.id, payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "儲存本機資料失敗。";
    const status = message.includes("無效") || message.includes("最多") || message.includes("重複") ||
      message.includes("權限驗證") ? 400 : 500;
    if (status === 500) console.error("Local workspace write failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
