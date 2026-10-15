"use client";

import { useEffect, useState } from "react";
import type { LocalAccount } from "@/lib/local-auth-types";
import AdminUsers from "@/app/admin-users";
import AuthScreen from "@/app/auth-screen";
import WorkspaceApp from "@/app/workspace";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("伺服器回傳無效資料。");
  }
  const body = data as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "要求失敗。");
  return body;
}

export default function AuthGate() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/local-auth", { cache: "no-store" })
      .then(readJson)
      .then((body) => {
        if (!active) return;
        setAccount((body.user as LocalAccount | null) ?? null);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "無法確認本機登入狀態。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    try {
      await readJson(await fetch("/api/local-auth", { method: "DELETE" }));
      setAccount(null);
      setAdminOpen(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登出失敗。");
    }
  }

  if (loading) {
    return <main className="auth-shell"><p role="status">正在載入本機帳號…</p></main>;
  }
  if (error && !account) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>無法載入本機帳號</h1>
          <p className="auth-message auth-error" role="alert">{error}</p>
          <button className="primary-action auth-submit" type="button" onClick={() => window.location.reload()}>
            重新載入
          </button>
        </section>
      </main>
    );
  }
  if (!account) {
    return <AuthScreen onAuthenticated={setAccount} />;
  }
  if (adminOpen && account.role === "admin") {
    return <AdminUsers currentUserId={account.id} onBack={() => setAdminOpen(false)} />;
  }

  return (
    <>
      {error && <p className="global-error" role="alert">{error}</p>}
      <WorkspaceApp
        localAccount={account}
        onSignOut={() => void signOut()}
        onOpenAdmin={() => setAdminOpen(true)}
      />
    </>
  );
}
