"use client";

import { useState, type FormEvent } from "react";
import type { LocalAccount } from "@/lib/local-auth-types";

type AuthMode = "login" | "signup";

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("本機伺服器回傳無效資料。");
  }
  const body = data as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "帳號操作失敗。");
  return body;
}

export default function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (account: LocalAccount) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/local-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      const body = await parseResponse(response);
      const account = body.user as LocalAccount;
      if (!account || typeof account.id !== "string") {
        throw new Error("登入成功但帳號資料無效，請重新載入。");
      }
      onAuthenticated(account);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "本機帳號操作失敗。");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /></div>
          <div>
            <div className="brand-name">紙嶼</div>
            <div className="brand-caption">NOTE ISLE</div>
          </div>
        </div>
        <p className="auth-eyebrow">本機帳號 · SQLite 資料庫</p>
        <h1 id="auth-title">{mode === "signup" ? "建立本機帳號" : "歡迎回來"}</h1>
        <p className="auth-description">
          {mode === "signup"
            ? "建立帳號後，筆記會保存在這台電腦的資料庫中。第一個帳號會成為管理員。"
            : "登入後即可開啟儲存在這台電腦的個人筆記。"}
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            電子郵件
            <input
              autoComplete="email"
              name="email"
              type="email"
              required
              maxLength={254}
              placeholder="name@example.com"
            />
          </label>
          <label>
            密碼
            <input
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              required
              placeholder={mode === "signup" ? "至少 8 個字元" : "輸入密碼"}
            />
          </label>
          {error && <p className="auth-message auth-error" role="alert">{error}</p>}
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="primary-action auth-submit" type="submit" disabled={busy}>
            {busy ? "處理中…" : mode === "signup" ? "建立帳號" : "登入"}
          </button>
        </form>

        <div className="auth-links">
          {mode === "login" ? (
            <>
              <span>還沒有本機帳號？</span>
              <button type="button" onClick={() => changeMode("signup")}>建立帳號</button>
            </>
          ) : (
            <>
              <span>已經有帳號？</span>
              <button type="button" onClick={() => changeMode("login")}>返回登入</button>
            </>
          )}
        </div>
        <p className="auth-footnote">帳號、密碼雜湊與筆記均保存在這台電腦的 SQLite 資料庫，不會連線到雲端。</p>
      </section>
    </main>
  );
}
