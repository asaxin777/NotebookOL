"use client";

import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { LocalAccount, LocalRole } from "@/lib/local-auth-types";

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("本機伺服器回傳無效資料。");
  }
  const body = data as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "管理操作失敗。");
  return body;
}

export default function AdminUsers({
  currentUserId,
  onBack,
}: {
  currentUserId: string;
  onBack: () => void;
}) {
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/local-users", { cache: "no-store" })
      .then(parseResponse)
      .then((body) => {
        if (active) setAccounts((body.users as LocalAccount[]) ?? []);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "無法載入本機帳號清單。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function changeRole(account: LocalAccount, role: LocalRole) {
    setBusyId(account.id);
    setError("");
    try {
      await parseResponse(await fetch("/api/local-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.id, role }),
      }));
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法更新本機帳號權限。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <button className="icon-button" type="button" aria-label="返回筆記" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="auth-eyebrow">本機帳號管理</p>
          <h1>帳號與權限</h1>
        </div>
      </header>
      <section className="admin-card">
        <p className="admin-description">
          管理員可以檢視此電腦上的帳號並調整角色；此頁不會顯示其他帳號的筆記內容。
        </p>
        {error && <p className="auth-message auth-error" role="alert">{error}</p>}
        {loading ? (
          <p className="admin-empty" role="status">載入帳號中…</p>
        ) : accounts.length === 0 ? (
          <p className="admin-empty">目前沒有帳號。</p>
        ) : (
          <ul className="profile-list">
            {accounts.map((account) => (
              <li className="profile-row" key={account.id}>
                <span className="profile-icon" aria-hidden="true">
                  {account.role === "admin" ? <ShieldCheck size={17} /> : <UserRound size={17} />}
                </span>
                <span className="profile-info">
                  <strong>{account.email}</strong>
                  <small>建立於 {new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(account.createdAt))}</small>
                </span>
                <span className={`role-badge ${account.role}`}>{account.role === "admin" ? "管理員" : "一般使用者"}</span>
                {account.id !== currentUserId && (
                  <button
                    className="role-action"
                    type="button"
                    disabled={busyId === account.id}
                    onClick={() => void changeRole(account, account.role === "admin" ? "user" : "admin")}
                  >
                    {busyId === account.id ? "更新中…" : account.role === "admin" ? "移除管理員" : "設為管理員"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="admin-footnote">角色變更由本機伺服器驗證，且至少保留一位管理員。</p>
      </section>
    </main>
  );
}
