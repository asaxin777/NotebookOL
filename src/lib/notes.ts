export type Note = {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  tags: string[];
  isFavorite: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
};

export type NoteFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type Workspace = {
  notes: Note[];
  folders: NoteFolder[];
};

export type NoteView =
  | "all"
  | "inbox"
  | "favorites"
  | "archive"
  | "trash"
  | "folder"
  | "tag";

export type NoteFilters = {
  view: NoteView;
  query?: string;
  folderId?: string;
  tag?: string;
};

export const STORAGE_KEY = "noteisle.workspace.v1";

export const EMPTY_WORKSPACE: Workspace = {
  notes: [],
  folders: [],
};

export function createNote(id: string, now: string): Note {
  return {
    id,
    title: "",
    content: "",
    folderId: null,
    tags: [],
    isFavorite: false,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
    version: 1,
  };
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();

  return tags.reduce<string[]>((normalized, rawTag) => {
    const tag = rawTag.trim().replace(/^#/, "");
    const key = tag.toLocaleLowerCase();

    if (tag && !seen.has(key)) {
      seen.add(key);
      normalized.push(tag);
    }

    return normalized;
  }, []);
}

export function updateNote(
  notes: Note[],
  noteId: string,
  changes: Partial<Pick<Note, "title" | "content" | "folderId" | "tags" | "isFavorite" | "isPinned">>,
  now: string,
): Note[] {
  return notes.map((note) => {
    if (note.id !== noteId || note.deletedAt) return note;

    const nextChanges = {
      ...changes,
      ...(changes.tags ? { tags: normalizeTags(changes.tags) } : {}),
    };
    const changed = Object.entries(nextChanges).some(([key, value]) => {
      const currentValue = note[key as keyof Note];
      return Array.isArray(value)
        ? JSON.stringify(value) !== JSON.stringify(currentValue)
        : value !== currentValue;
    });

    if (!changed) return note;

    return {
      ...note,
      ...nextChanges,
      version: note.version + 1,
      updatedAt: now,
    };
  });
}

export function moveNoteToTrash(notes: Note[], noteId: string, now: string): Note[] {
  return notes.map((note) =>
    note.id === noteId && !note.deletedAt
      ? { ...note, deletedAt: now, updatedAt: now, version: note.version + 1 }
      : note,
  );
}

export function restoreNote(notes: Note[], noteId: string, now: string): Note[] {
  return notes.map((note) =>
    note.id === noteId && note.deletedAt
      ? { ...note, deletedAt: null, updatedAt: now, version: note.version + 1 }
      : note,
  );
}

export function permanentlyDeleteNote(notes: Note[], noteId: string): Note[] {
  return notes.filter((note) => note.id !== noteId);
}

export function setArchived(
  notes: Note[],
  noteId: string,
  archived: boolean,
  now: string,
): Note[] {
  return notes.map((note) => {
    if (note.id !== noteId || note.deletedAt) return note;
    const archivedAt = archived ? now : null;
    if (note.archivedAt === archivedAt) return note;

    return { ...note, archivedAt, updatedAt: now, version: note.version + 1 };
  });
}

export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";

  return notes
    .filter((note) => {
      if (filters.view === "trash") return Boolean(note.deletedAt);
      if (note.deletedAt) return false;
      if (filters.view === "archive") return Boolean(note.archivedAt);
      if (note.archivedAt) return false;
      if (filters.view === "favorites" && !note.isFavorite) return false;
      if (filters.view === "inbox" && note.folderId) return false;
      if (filters.view === "folder" && note.folderId !== filters.folderId) return false;
      if (filters.view === "tag" && !note.tags.includes(filters.tag ?? "")) return false;
      if (filters.folderId && note.folderId !== filters.folderId) return false;
      if (filters.tag && !note.tags.includes(filters.tag)) return false;
      if (!query) return true;

      const searchable = `${note.title}\n${note.content}\n${note.tags.join(" ")}`.toLocaleLowerCase();
      return searchable.includes(query);
    })
    .sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      const timeOrder = right.updatedAt.localeCompare(left.updatedAt);
      return timeOrder || left.id.localeCompare(right.id);
    });
}

export function exportNoteMarkdown(note: Note): string {
  const title = note.title.trim();
  const content = note.content.trimEnd();
  return [title ? `# ${title}` : "", content].filter(Boolean).join("\n\n");
}

export function importMarkdown(markdown: string, id: string, now: string): Note {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const heading = normalized.match(/^#\s+(.+?)\s*(?:\n|$)/);
  const title = heading?.[1]?.trim() ?? "";
  const content = heading
    ? normalized.slice(heading[0].length).replace(/^\n+/, "").trimEnd()
    : normalized.trimEnd();

  return { ...createNote(id, now), title, content };
}

export function exportWorkspace(workspace: Workspace): string {
  return JSON.stringify({ format: "noteisle", version: 1, ...workspace }, null, 2);
}

export type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

export function loadWorkspace(storage: WorkspaceStorage): Workspace {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? EMPTY_WORKSPACE : importWorkspace(raw);
}

export function saveWorkspace(storage: WorkspaceStorage, workspace: Workspace): void {
  storage.setItem(STORAGE_KEY, exportWorkspace(workspace));
}

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<Note>;
  return (
    typeof note.id === "string" &&
    typeof note.title === "string" &&
    typeof note.content === "string" &&
    (typeof note.folderId === "string" || note.folderId === null) &&
    Array.isArray(note.tags) &&
    note.tags.every((tag) => typeof tag === "string") &&
    typeof note.isFavorite === "boolean" &&
    typeof note.isPinned === "boolean" &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string" &&
    (typeof note.archivedAt === "string" || note.archivedAt === null) &&
    (typeof note.deletedAt === "string" || note.deletedAt === null) &&
    Number.isInteger(note.version) &&
    Number(note.version) > 0
  );
}

function isNoteFolder(value: unknown): value is NoteFolder {
  if (!value || typeof value !== "object") return false;
  const folder = value as Partial<NoteFolder>;
  return (
    typeof folder.id === "string" &&
    typeof folder.name === "string" &&
    typeof folder.createdAt === "string"
  );
}

export function importWorkspace(raw: string): Workspace {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("備份格式無效");

  const payload = parsed as { format?: unknown; version?: unknown; notes?: unknown; folders?: unknown };
  if (
    payload.format !== "noteisle" ||
    payload.version !== 1 ||
    !Array.isArray(payload.notes) ||
    !payload.notes.every(isNote) ||
    !Array.isArray(payload.folders) ||
    !payload.folders.every(isNoteFolder)
  ) {
    throw new Error("備份格式或欄位不相容");
  }

  return { notes: payload.notes, folders: payload.folders };
}