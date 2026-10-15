import "server-only";

import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { cookies } from "next/headers";
import type { LocalAccount } from "@/lib/local-auth-types";
import { importWorkspace, type Note, type NoteFolder, type Workspace } from "@/lib/notes";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "noteisle_local_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14;
const PASSWORD_HASH_BYTES = 64;

export type LocalRole = "admin" | "user";

export type LocalUser = {
  id: string;
  email: string;
  role: LocalRole;
  createdAt: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: LocalRole;
  created_at: string;
};

type SessionUserRow = {
  id: string;
  email: string;
  role: LocalRole;
  created_at: string;
  expires_at: string;
};

type NoteRow = {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  tags: string;
  is_favorite: number;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  version: number;
};

type FolderRow = {
  id: string;
  name: string;
  created_at: string;
};

type AccountRow = {
  id: string;
  email: string;
  role: LocalRole;
  created_at: string;
};

const databasePath = process.env.NOTEISLE_DB_PATH
  ? path.resolve(process.env.NOTEISLE_DB_PATH)
  : path.join(process.cwd(), ".data", "noteisle.sqlite");

declare global {
  var noteIsleDatabase: Database.Database | undefined;
}

function getDatabase(): Database.Database {
  if (globalThis.noteIsleDatabase) return globalThis.noteIsleDatabase;

  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table if not exists users (
      id text primary key,
      email text not null collate nocase unique,
      password_hash text not null,
      role text not null default 'user' check (role in ('user', 'admin')),
      created_at text not null
    );

    create table if not exists sessions (
      token_hash text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at text not null
    );

    create index if not exists sessions_user_id_idx on sessions(user_id);

    create table if not exists folders (
      id text primary key,
      owner_id text not null references users(id) on delete cascade,
      name text not null check (length(trim(name)) between 1 and 40),
      created_at text not null
    );

    create unique index if not exists folders_owner_name_unique
      on folders(owner_id, lower(name));

    create table if not exists notes (
      id text primary key,
      owner_id text not null references users(id) on delete cascade,
      title text not null default '',
      content text not null default '',
      folder_id text references folders(id) on delete set null,
      tags text not null default '[]',
      is_favorite integer not null default 0 check (is_favorite in (0, 1)),
      is_pinned integer not null default 0 check (is_pinned in (0, 1)),
      created_at text not null,
      updated_at text not null,
      archived_at text,
      deleted_at text,
      version integer not null default 1 check (version > 0)
    );

    create index if not exists notes_owner_updated_idx
      on notes(owner_id, updated_at desc);
  `);
  const userCount = database.prepare("select count(*) as count from users").get() as { count: number };
  if (userCount.count === 0) {
    const salt = randomBytes(16);
    const hash = scryptSync("admin", salt, PASSWORD_HASH_BYTES);
    database
      .prepare("insert into users (id, email, password_hash, role, created_at) values (?, ?, ?, ?, ?)")
      .run(
        randomUUID(),
        "admin",
        `${salt.toString("hex")}:${hash.toString("hex")}`,
        "admin",
        new Date().toISOString(),
      );
  }
  globalThis.noteIsleDatabase = database;
  return database;
}

function toLocalUser(row: Pick<UserRow, "id" | "email" | "role" | "created_at">): LocalUser {
  return { id: row.id, email: row.email, role: row.role, createdAt: row.created_at };
}

function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, PASSWORD_HASH_BYTES)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [saltHex, expectedHex] = encoded.split(":");
  if (!saltHex || !expectedHex || !/^[a-f0-9]{32}$/i.test(saltHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== PASSWORD_HASH_BYTES) return false;
  const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return timingSafeEqual(actual, expected);
}

function createSessionForUser(userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000).toISOString();
  getDatabase()
    .prepare("insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)")
    .run(sessionTokenHash(token), userId, expiresAt);
  return { token, expiresAt };
}

export async function registerLocalUser(
  rawEmail: string,
  password: string,
): Promise<{ user: LocalUser; token: string; expiresAt: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("請輸入有效的電子郵件地址。");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("密碼長度需介於 8 到 128 個字元。");
  }

  const passwordHash = await hashPassword(password);
  const database = getDatabase();
  const createAccount = database.transaction(() => {
    const existing = database.prepare("select id from users where email = ?").get(email);
    if (existing) throw new Error("此電子郵件已註冊，請改為登入。");

    const role = database.prepare("select count(*) as count from users").get() as { count: number };
    const user: UserRow = {
      id: randomUUID(),
      email,
      password_hash: passwordHash,
      role: role.count === 0 ? "admin" : "user",
      created_at: new Date().toISOString(),
    };
    database
      .prepare("insert into users (id, email, password_hash, role, created_at) values (?, ?, ?, ?, ?)")
      .run(user.id, user.email, user.password_hash, user.role, user.created_at);
    const session = createSessionForUser(user.id);
    return { user: toLocalUser(user), ...session };
  });

  try {
    return createAccount();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new Error("此電子郵件已註冊，請改為登入。");
    }
    throw error;
  }
}

export async function loginLocalUser(
  rawEmail: string,
  password: string,
): Promise<{ user: LocalUser; token: string; expiresAt: string }> {
  const email = rawEmail.trim().toLowerCase();
  const database = getDatabase();
  const user = database.prepare("select * from users where email = ?").get(email) as UserRow | undefined;
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new Error("電子郵件或密碼不正確。");
  }
  const session = createSessionForUser(user.id);
  return { user: toLocalUser(user), ...session };
}

export async function currentLocalUser(): Promise<LocalUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const database = getDatabase();
  const row = database
    .prepare(`
      select users.id, users.email, users.role, users.created_at, sessions.expires_at
      from sessions join users on users.id = sessions.user_id
      where sessions.token_hash = ?
    `)
    .get(sessionTokenHash(token)) as SessionUserRow | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    database.prepare("delete from sessions where token_hash = ?").run(sessionTokenHash(token));
    return null;
  }

  return toLocalUser(row);
}

export function revokeLocalSession(token: string | undefined): void {
  if (!token) return;
  getDatabase().prepare("delete from sessions where token_hash = ?").run(sessionTokenHash(token));
}

export function getLocalSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function getLocalSessionMaxAge(): number {
  return SESSION_DURATION_SECONDS;
}

export function readLocalWorkspace(userId: string): Workspace {
  const database = getDatabase();
  const noteRows = database
    .prepare("select * from notes where owner_id = ? order by is_pinned desc, updated_at desc, id")
    .all(userId) as NoteRow[];
  const folderRows = database
    .prepare("select * from folders where owner_id = ? order by name collate nocase, id")
    .all(userId) as FolderRow[];

  const notes: Note[] = noteRows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    folderId: row.folder_id,
    tags: JSON.parse(row.tags) as string[],
    isFavorite: Boolean(row.is_favorite),
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    version: row.version,
  }));
  const folders: NoteFolder[] = folderRows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
  return { notes, folders };
}

export function writeLocalWorkspace(userId: string, payload: unknown): void {
  let workspace: Workspace;
  try {
    workspace = importWorkspace(
      JSON.stringify({ format: "noteisle", version: 1, ...(payload as object) }),
    );
  } catch {
    throw new Error("工作區資料格式無效，沒有儲存任何變更。");
  }
  if (workspace.notes.length > 5000 || workspace.folders.length > 500) {
    throw new Error("單次最多可儲存 5,000 篇筆記及 500 個資料夾。");
  }

  const database = getDatabase();
  const save = database.transaction(() => {
    const noteIds = new Set(workspace.notes.map((note) => note.id));
    const folderIds = new Set(workspace.folders.map((folder) => folder.id));
    if (noteIds.size !== workspace.notes.length || folderIds.size !== workspace.folders.length) {
      throw new Error("工作區中有重複的識別碼。");
    }

    const getFolderOwner = database.prepare("select owner_id from folders where id = ?");
    const upsertFolder = database.prepare(`
      insert into folders (id, owner_id, name, created_at) values (?, ?, ?, ?)
      on conflict(id) do update set name = excluded.name, created_at = excluded.created_at
      where folders.owner_id = excluded.owner_id
    `);
    for (const folder of workspace.folders) {
      const existing = getFolderOwner.get(folder.id) as { owner_id: string } | undefined;
      if (existing && existing.owner_id !== userId) throw new Error("資料夾權限驗證失敗。");
      upsertFolder.run(folder.id, userId, folder.name, folder.createdAt);
    }

    const getNoteOwner = database.prepare("select owner_id from notes where id = ?");
    const upsertNote = database.prepare(`
      insert into notes (
        id, owner_id, title, content, folder_id, tags, is_favorite, is_pinned,
        created_at, updated_at, archived_at, deleted_at, version
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        title = excluded.title,
        content = excluded.content,
        folder_id = excluded.folder_id,
        tags = excluded.tags,
        is_favorite = excluded.is_favorite,
        is_pinned = excluded.is_pinned,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at,
        deleted_at = excluded.deleted_at,
        version = excluded.version
      where notes.owner_id = excluded.owner_id
    `);
    for (const note of workspace.notes) {
      const existing = getNoteOwner.get(note.id) as { owner_id: string } | undefined;
      if (existing && existing.owner_id !== userId) throw new Error("筆記權限驗證失敗。");
      if (note.folderId && !folderIds.has(note.folderId)) {
        const folder = database
          .prepare("select owner_id from folders where id = ?")
          .get(note.folderId) as { owner_id: string } | undefined;
        if (!folder || folder.owner_id !== userId) throw new Error("筆記資料夾權限驗證失敗。");
      }
      upsertNote.run(
        note.id,
        userId,
        note.title,
        note.content,
        note.folderId,
        JSON.stringify(note.tags),
        Number(note.isFavorite),
        Number(note.isPinned),
        note.createdAt,
        note.updatedAt,
        note.archivedAt,
        note.deletedAt,
        note.version,
      );
    }

    const deleteNote = database.prepare("delete from notes where owner_id = ? and id = ?");
    const existingNoteRows = database.prepare("select id from notes where owner_id = ?").all(userId) as { id: string }[];
    for (const row of existingNoteRows) {
      if (!noteIds.has(row.id)) deleteNote.run(userId, row.id);
    }

    const deleteFolder = database.prepare("delete from folders where owner_id = ? and id = ?");
    const existingFolderRows = database.prepare("select id from folders where owner_id = ?").all(userId) as { id: string }[];
    for (const row of existingFolderRows) {
      if (!folderIds.has(row.id)) deleteFolder.run(userId, row.id);
    }
  });

  save();
}

export function listLocalUsers(): LocalAccount[] {
  const rows = getDatabase()
    .prepare("select id, email, role, created_at from users order by created_at, id")
    .all() as AccountRow[];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  }));
}

export function updateLocalUserRole(userId: string, targetUserId: string, role: unknown): void {
  if (userId === targetUserId) throw new Error("不能變更自己的管理員權限。");
  if (role !== "admin" && role !== "user") throw new Error("指定的帳號角色無效。");

  const database = getDatabase();
  const changeRole = database.transaction(() => {
    const target = database.prepare("select role from users where id = ?").get(targetUserId) as { role: LocalRole } | undefined;
    if (!target) throw new Error("找不到指定帳號。");
    if (
      role === "user" &&
      target.role === "admin" &&
      (database.prepare("select count(*) as count from users where role = 'admin'").get() as { count: number }).count <= 1
    ) {
      throw new Error("至少必須保留一位管理員。");
    }
    database.prepare("update users set role = ? where id = ?").run(role, targetUserId);
  });
  changeRole();
}
