import { describe, expect, it } from "vitest";
import {
  createNote,
  exportNoteMarkdown,
  exportWorkspace,
  filterNotes,
  importMarkdown,
  importWorkspace,
  loadWorkspace,
  moveNoteToTrash,
  normalizeTags,
  permanentlyDeleteNote,
  restoreNote,
  saveWorkspace,
  setArchived,
  updateNote,
  type Note,
} from "@/lib/notes";

const timeA = "2026-10-01T10:00:00.000Z";
const timeB = "2026-10-02T10:00:00.000Z";

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, timeA), ...overrides };
}

const fixtures = [
  makeNote("meeting", {
    title: "研究會議",
    content: "討論搜尋功能與測試策略；search function",
    folderId: "work",
    tags: ["研究", "MVP"],
    updatedAt: timeB,
  }),
  makeNote("recipe", {
    title: "午餐靈感",
    content: "加入番茄與 basil",
    tags: ["生活"],
  }),
  makeNote("archived", { title: "舊筆記", archivedAt: timeB }),
  makeNote("deleted", { title: "垃圾桶筆記", deletedAt: timeB }),
];

describe("note creation and updates", () => {
  it("creates an unnamed note with stable defaults", () => {
    expect(createNote("n-1", timeA)).toEqual({
      id: "n-1",
      title: "",
      content: "",
      folderId: null,
      tags: [],
      isFavorite: false,
      isPinned: false,
      createdAt: timeA,
      updatedAt: timeA,
      archivedAt: null,
      deletedAt: null,
      version: 1,
    });
  });

  it("normalizes tags without changing the first spelling", () => {
    expect(normalizeTags([" #研究 ", "研究", "MVP", "mvp", "  "])).toEqual([
      "研究",
      "MVP",
    ]);
  });

  it("increments version and updated time only when a field changes", () => {
    const updated = updateNote(fixtures, "meeting", { title: "更新標題" }, timeB);
    expect(updated[0]).toMatchObject({ title: "更新標題", version: 2, updatedAt: timeB });
    expect(updated[1]).toBe(fixtures[1]);
  });

  it("does not create a version for an identical update", () => {
    const updated = updateNote(fixtures, "meeting", { title: "研究會議" }, timeB);
    expect(updated[0]).toBe(fixtures[0]);
  });

  it("does not mutate the input fixture", () => {
    const before = structuredClone(fixtures);
    updateNote(fixtures, "meeting", { tags: [" New ", "new"] }, timeB);
    expect(fixtures).toEqual(before);
  });

  it("does not edit a note after it enters the trash", () => {
    const updated = updateNote(fixtures, "deleted", { title: "改名" }, timeB);
    expect(updated[3]).toBe(fixtures[3]);
  });
});

describe("lifecycle and views", () => {
  it("moves a note into trash exactly once", () => {
    const trashed = moveNoteToTrash(fixtures, "meeting", timeB);
    expect(trashed[0]).toMatchObject({ deletedAt: timeB, version: 2 });
    expect(moveNoteToTrash(trashed, "meeting", timeA)[0]).toEqual(trashed[0]);
  });

  it("restores a trashed note without changing its content", () => {
    const restored = restoreNote(fixtures, "deleted", timeB).find(
      (note) => note.id === "deleted",
    );
    expect(restored).toMatchObject({ title: "垃圾桶筆記", deletedAt: null, version: 2 });
  });

  it("permanently deletes only the requested note", () => {
    expect(permanentlyDeleteNote(fixtures, "deleted").map((note) => note.id)).toEqual([
      "meeting",
      "recipe",
      "archived",
    ]);
  });

  it("archives and unarchives without changing trashed notes", () => {
    const archived = setArchived(fixtures, "meeting", true, timeB);
    expect(archived[0]).toMatchObject({ archivedAt: timeB, version: 2 });
    expect(setArchived(archived, "meeting", false, timeA)[0].archivedAt).toBeNull();
    expect(setArchived(fixtures, "deleted", true, timeB)[3]).toBe(fixtures[3]);
  });

  it("keeps views mutually exclusive and sorts recent/pinned notes first", () => {
    expect(filterNotes(fixtures, { view: "all" }).map((note) => note.id)).toEqual([
      "meeting",
      "recipe",
    ]);
    expect(filterNotes(fixtures, { view: "archive" }).map((note) => note.id)).toEqual([
      "archived",
    ]);
    expect(filterNotes(fixtures, { view: "trash" }).map((note) => note.id)).toEqual([
      "deleted",
    ]);
    const pinned = updateNote(fixtures, "recipe", { isPinned: true }, timeA);
    expect(filterNotes(pinned, { view: "all" })[0].id).toBe("recipe");
  });

  it("filters by folder, tag, title, body, and mixed-case English", () => {
    expect(filterNotes(fixtures, { view: "folder", folderId: "work" })).toHaveLength(1);
    expect(filterNotes(fixtures, { view: "tag", tag: "生活" })).toHaveLength(1);
    expect(filterNotes(fixtures, { view: "all", query: "研究" })[0].id).toBe("meeting");
    expect(filterNotes(fixtures, { view: "all", query: "SEARCH FUNCTION" })[0].id).toBe(
      "meeting",
    );
    expect(filterNotes(fixtures, { view: "all", query: "mvp" })[0].id).toBe("meeting");
  });
});

describe("import and export contracts", () => {
  it("round-trips a Markdown note while preserving its body", () => {
    const note = makeNote("note-1", {
      title: "繁體中文筆記",
      content: "- 一個項目\n- **粗體** 與 [連結](https://example.com)",
    });
    const imported = importMarkdown(exportNoteMarkdown(note), "note-2", timeB);
    expect(imported).toMatchObject({
      id: "note-2",
      title: note.title,
      content: note.content,
      createdAt: timeB,
    });
  });

  it("imports titleless Markdown, a BOM, and Windows line endings", () => {
    expect(importMarkdown("\uFEFF純文字\r\n第二行", "plain", timeA)).toMatchObject({
      title: "",
      content: "純文字\n第二行",
    });
  });

  it("preserves later Markdown headings as body content", () => {
    const imported = importMarkdown("# 標題\n\n## 區段\n內容", "sections", timeA);
    expect(imported.title).toBe("標題");
    expect(imported.content).toBe("## 區段\n內容");
  });

  it("round-trips a workspace backup", () => {
    const workspace = {
      notes: fixtures,
      folders: [{ id: "work", name: "工作", createdAt: timeA }],
    };
    expect(importWorkspace(exportWorkspace(workspace))).toEqual(workspace);
  });

  it.each([
    ["not JSON", "Unexpected token"],
    ['{"format":"other","version":1,"notes":[],"folders":[]}', "不相容"],
    ['{"format":"noteisle","version":1,"notes":[{}],"folders":[]}', "不相容"],
  ])("rejects invalid backup input: %s", (input, message) => {
    expect(() => importWorkspace(input)).toThrow(message);
  });

  it("loads an empty workspace when browser storage has no saved value", () => {
    expect(loadWorkspace({ getItem: () => null, setItem: () => undefined })).toEqual({
      notes: [],
      folders: [],
    });
  });

  it("persists then reloads a workspace using the stable storage key", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const workspace = {
      notes: [fixtures[0]],
      folders: [{ id: "work", name: "工作", createdAt: timeA }],
    };

    saveWorkspace(storage, workspace);

    expect(loadWorkspace(storage)).toEqual(workspace);
  });

  it("surfaces corrupted persisted data instead of silently replacing it", () => {
    const storage = {
      getItem: () => "{broken",
      setItem: () => undefined,
    };
    expect(() => loadWorkspace(storage)).toThrow();
  });
});