import { NextRequest, NextResponse } from "next/server";
import {
  currentLocalUser,
  getLocalSessionCookieName,
  getLocalSessionMaxAge,
  loginLocalUser,
  registerLocalUser,
  revokeLocalSession,
} from "@/lib/local-db";

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

function setSessionCookie(
  response: NextResponse,
  token: string,
  maxAge = getLocalSessionMaxAge(),
): void {
  response.cookies.set(getLocalSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: response.headers.get("x-forwarded-proto") === "https" ||
      process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function GET() {
  try {
    return NextResponse.json({ user: await currentLocalUser() });
  } catch (error) {
    console.error("Local session lookup failed:", error);
    return NextResponse.json({ error: "無法讀取本機登入狀態。" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "不允許的來源。" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "登入資料格式無效。" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.email !== "string" ||
      typeof input.password !== "string" ||
      (input.action !== "login" && input.action !== "signup")
    ) {
      return NextResponse.json({ error: "請輸入電子郵件與密碼。" }, { status: 400 });
    }

    const session =
      input.action === "signup"
        ? await registerLocalUser(input.email, input.password)
        : await loginLocalUser(input.email, input.password);
    const response = NextResponse.json({ user: session.user });
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "登入失敗，請稍後再試。";
    const status = message.includes("已註冊") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "不允許的來源。" }, { status: 403 });
  }

  try {
    const token = request.cookies.get(getLocalSessionCookieName())?.value;
    revokeLocalSession(token);
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, "", 0);
    return response;
  } catch (error) {
    console.error("Local logout failed:", error);
    return NextResponse.json({ error: "登出失敗，請稍後再試。" }, { status: 500 });
  }
}
