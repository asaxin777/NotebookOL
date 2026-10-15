"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ChevronDown,
  CloudOff,
  Database as DatabaseIcon,
  FileInput,
  FileText,
  Folder,
  FolderPlus,
  Heart,
  Inbox,
  List,
  LogOut,
  Menu,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  EMPTY_WORKSPACE,
  createNote,
  exportNoteMarkdown,
  exportWorkspace,
  filterNotes,
  importMarkdown,
  loadWorkspace,
  moveNoteToTrash,
  normalizeTags,
  permanentlyDeleteNote,
  restoreNote,
  saveWorkspace,
  setArchived,
  updateNote,
  type Note,
  type NoteView,
  type Workspace,
} from "@/lib/notes";
import type { LocalAccount } from "@/lib/local-auth-types";

const NAV_ITEMS: { view: NoteView; label: string; icon: typeof Inbox }[] = [
  { view: "all", label: "全部筆記", icon: FileText },
  { view: "inbox", label: "收件匣", icon: Inbox },
  { view: "favorites", label: "收藏", icon: Heart },
  { view: "archive", label: "封存", icon: Archive },
  { view: "trash", label: "垃圾桶", icon: Trash2 },
];

type SaveState = "loading" | "saving" | "saved" | "error";

type WorkspaceAppProps = {
  localAccount?: LocalAccount;
  onSignOut?: () => void;
  onOpenAdmin?: () => void;
};

function noteLabel(note: Note): string {
  return note.title.trim() || "未命名筆記";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("檔案讀取失敗"));
    reader.readAsText(file);
  });
}

export default function WorkspaceApp({
  localAccount,
  onSignOut,
  onOpenAdmin,
}: WorkspaceAppProps = {}) {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [storageIssue, setStorageIssue] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [view, setView] = useState<NoteView>("all");
  const [folderFilter, setFolderFilter] = useState<string | undefined>();
  const [tagFilter, setTagFilter] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionDismissed, setSelectionDismissed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const localUserId = localAccount?.id;
  const localSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    if (localUserId) {
      void fetch("/api/local-workspace", { cache: "no-store" })
        .then(async (response) => {
          const payload: unknown = await response.json();
          if (!response.ok) {
            const message =
              payload && typeof payload === "object" && "error" in payload &&
              typeof payload.error === "string"
                ? payload.error
                : "無法讀取本機資料庫。";
            throw new Error(message);
          }
          return payload as Workspace;
        })
        .then((loadedWorkspace) => {
          if (active) {
            setWorkspace(loadedWorkspace);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          setStorageIssue(true);
          setStorageError(error instanceof Error ? error.message : "本機資料庫讀取失敗。");
          setSaveState("error");
        })
        .finally(() => {
          if (active) setHydrated(true);
        });
      return () => {
        active = false;
      };
    }

    const timeout = window.setTimeout(() => {
      try {
        setWorkspace(loadWorkspace(window.localStorage));
      } catch {
        setStorageIssue(true);
        setStorageError("無法讀取此瀏覽器的本機資料。");
        setSaveState("error");
      } finally {
        if (active) setHydrated(true);
      }
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [localUserId]);

  useEffect(() => {
    if (!hydrated || storageIssue) return;
    const timeout = window.setTimeout(() => {
      if (localAccount) {
        const queuedSave = localSaveQueue.current
          .then(async () => {
            const response = await fetch("/api/local-workspace", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(workspace),
            });
            const result: unknown = await response.json();
            if (!response.ok) {
              const message =
                result && typeof result === "object" && "error" in result &&
                typeof result.error === "string"
                  ? result.error
                  : "本機資料庫儲存失敗。";
              throw new Error(message);
            }
            setStorageError("");
            setSaveState("saved");
          })
          .catch((error: unknown) => {
            setStorageError(error instanceof Error ? error.message : "本機資料庫儲存失敗。");
            setSaveState("error");
          });
        localSaveQueue.current = queuedSave;
      } else {
        try {
          saveWorkspace(window.localStorage, workspace);
          setStorageError("");
          setSaveState("saved");
        } catch (error) {
          setStorageError(error instanceof Error ? error.message : "本機資料儲存失敗。");
          setSaveState("error");
        }
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [hydrated, localAccount, storageIssue, workspace]);

  useEffect(() => {
    if (selectedId) titleRef.current?.focus();
  }, [selectedId]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const command = event.metaKey || event.ctrlKey;
      if (!command) return;

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        createNewNote();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  if (!hydrated && localAccount) {
    return <main className="auth-shell"><p role="status">正在載入你的本機筆記…</p></main>;
  }

  const visibleNotes = filterNotes(workspace.notes, {
    view,
    query: deferredQuery,
    folderId: view === "folder" ? folderFilter : undefined,
    tag: view === "tag" ? tagFilter : undefined,
  });
  const selectedNote = selectionDismissed
    ? visibleNotes.find((note) => note.id === selectedId) ?? null
    : visibleNotes.find((note) => note.id === selectedId) ?? visibleNotes[0] ?? null;
  const allTags = Array.from(
    new Set(
      workspace.notes
        .filter((note) => !note.deletedAt)
        .flatMap((note) => note.tags),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-TW"));

  function selectView(nextView: NoteView) {
    setView(nextView);
    setFolderFilter(undefined);
    setTagFilter(undefined);
    setSelectedId(null);
    setSelectionDismissed(false);
    setMobileNavOpen(false);
  }

  function createNewNote() {
    if (storageIssue) return;
    const now = new Date().toISOString();
    const note = createNote(crypto.randomUUID(), now);
    setSaveState("saving");
    setWorkspace((current) => ({ ...current, notes: [note, ...current.notes] }));
    setView("all");
    setFolderFilter(undefined);
    setTagFilter(undefined);
    setSelectedId(note.id);
    setSelectionDismissed(false);
    setPreview(false);
    setMobileNavOpen(false);
  }

  function changeNote(noteId: string, changes: Partial<Pick<Note, "title" | "content" | "folderId" | "tags" | "isFavorite" | "isPinned">>) {
    setSaveState("saving");
    setWorkspace((current) => ({
      ...current,
      notes: updateNote(current.notes, noteId, changes, new Date().toISOString()),
    }));
  }

  function addFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderDraft.trim();
    if (!name) return;
    const exists = workspace.folders.some(
      (folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (exists) return;

    setWorkspace((current) => ({
      ...current,
      folders: [
        ...current.folders,
        { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() },
      ],
    }));
    setFolderDraft("");
    setFolderFormOpen(false);
  }

  function addTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedNote || !tagDraft.trim()) return;
    changeNote(selectedNote.id, { tags: normalizeTags([...selectedNote.tags, tagDraft]) });
    setTagDraft("");
  }

  function insertMarkdown(before: string, after = "") {
    const editor = contentRef.current;
    if (!editor || !selectedNote) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = selectedNote.content.slice(start, end);
    const replacement = `${before}${selectedText || (after ? "文字" : "")}${after}`;
    const content =
      selectedNote.content.slice(0, start) + replacement + selectedNote.content.slice(end);
    changeNote(selectedNote.id, { content });
    requestAnimationFrame(() => {
      editor.focus();
      const caret = start + before.length + (selectedText ? selectedText.length : after ? 2 : 0);
      editor.setSelectionRange(caret, caret);
    });
  }

  async function importFile(file?: File) {
    if (!file || storageIssue) return;
    try {
      const text = await readTextFile(file);
      const imported = importMarkdown(text, crypto.randomUUID(), new Date().toISOString());
      setWorkspace((current) => ({ ...current, notes: [imported, ...current.notes] }));
      setView("all");
      setSelectedId(imported.id);
      setPreview(false);
      setMobileNavOpen(false);
    } catch {
      window.alert("無法匯入這個檔案，請確認它是有效的 Markdown 或文字檔。");
    }
    if (importRef.current) importRef.current.value = "";
  }

  function trashNote(note: Note) {
    setWorkspace((current) => ({
      ...current,
      notes: moveNoteToTrash(current.notes, note.id, new Date().toISOString()),
    }));
    setSelectedId(null);
  }

  function permanentlyDelete(note: Note) {
    if (!window.confirm(`永久刪除「${noteLabel(note)}」？這個動作無法復原。`)) return;
    setWorkspace((current) => ({
      ...current,
      notes: permanentlyDeleteNote(current.notes, note.id),
    }));
    setSelectedId(null);
  }

  const viewTitle =
    view === "folder"
      ? workspace.folders.find((folder) => folder.id === folderFilter)?.name ?? "資料夾"
      : view === "tag"
        ? `# ${tagFilter ?? "標籤"}`
        : NAV_ITEMS.find((item) => item.view === view)?.label ?? "全部筆記";

  return (
    <main className={`app-shell ${selectedNote ? "has-selection" : "has-no-selection"}`}>
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </div>
          <div>
            <div className="brand-name">紙嶼</div>
            <div className="brand-caption">NOTE ISLE</div>
          </div>
          <button
            className="icon-button mobile-close"
            type="button"
            aria-label="關閉導覽"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <button className="new-note-button" type="button" onClick={createNewNote} disabled={storageIssue}>
          <Plus size={17} strokeWidth={2.4} />
          <span>新增筆記</span>
          <kbd>⌘ N</kbd>
        </button>

        <nav aria-label="筆記導覽" className="primary-nav">
          <div className="nav-section-label">工作區</div>
          {NAV_ITEMS.map(({ view: itemView, label, icon: Icon }) => {
            const count = filterNotes(workspace.notes, { view: itemView }).length;
            return (
              <button
                className={`nav-item ${view === itemView ? "nav-item-active" : ""}`}
                type="button"
                key={itemView}
                aria-current={view === itemView ? "page" : undefined}
                onClick={() => selectView(itemView)}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
                <span className="nav-count">{count || ""}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-group-heading">
          <span>資料夾</span>
          <button
            className="icon-button small-icon"
            type="button"
            aria-label="新增資料夾"
            title="新增資料夾"
            onClick={() => setFolderFormOpen((open) => !open)}
          >
            <FolderPlus size={16} />
          </button>
        </div>
        {folderFormOpen && (
          <form className="folder-form" onSubmit={addFolder}>
            <input
              aria-label="資料夾名稱"
              autoFocus
              maxLength={40}
              placeholder="資料夾名稱"
              value={folderDraft}
              onChange={(event) => setFolderDraft(event.target.value)}
            />
            <button type="submit" aria-label="建立資料夾" disabled={!folderDraft.trim()}>
              <Check size={15} />
            </button>
          </form>
        )}
        <div className="folder-list">
          {workspace.folders.map((folder) => (
            <button
              className={`nav-item ${view === "folder" && folderFilter === folder.id ? "nav-item-active" : ""}`}
              type="button"
              key={folder.id}
              onClick={() => {
                setView("folder");
                setFolderFilter(folder.id);
                setTagFilter(undefined);
                setSelectedId(null);
                setMobileNavOpen(false);
              }}
            >
              <Folder size={16} strokeWidth={1.8} />
              <span className="nav-item-truncate">{folder.name}</span>
            </button>
          ))}
          {workspace.folders.length === 0 && !folderFormOpen && (
            <p className="sidebar-empty">建立資料夾，分類你的筆記</p>
          )}
        </div>

        <div className="sidebar-group-heading tag-heading">
          <span>標籤</span>
          <Tag size={15} />
        </div>
        <div className="tag-nav-list">
          {allTags.map((tag) => (
            <button
              className={`tag-nav-item ${view === "tag" && tagFilter === tag ? "tag-nav-active" : ""}`}
              type="button"
              key={tag}
              onClick={() => {
                setView("tag");
                setTagFilter(tag);
                setFolderFilter(undefined);
                setSelectedId(null);
                setMobileNavOpen(false);
              }}
            >
              <span className="tag-dot" />
              {tag}
            </button>
          ))}
          {allTags.length === 0 && <p className="sidebar-empty">筆記的標籤會顯示在這裡</p>}
        </div>

        <div className="sidebar-bottom">
          <div className="sync-status">
            <span className="sync-icon">{localAccount ? <DatabaseIcon size={15} /> : <CloudOff size={15} />}</span>
            <span>
              <strong>{localAccount ? "SQLite 本機資料庫" : "僅儲存在此裝置"}</strong>
              <small>{localAccount ? localAccount.email : "本機展示，不會與他人同步"}</small>
            </span>
            <Settings2 size={15} className="sync-settings" aria-hidden="true" />
          </div>
          {storageError && <p className="sync-error" role="alert">{storageError}</p>}
          {localAccount && (
            <div className="account-actions">
              <span className="account-email" title={localAccount.email}>{localAccount.email}</span>
              {localAccount.role === "admin" && (
                <button type="button" onClick={onOpenAdmin} aria-label="管理使用者" title="管理使用者">
                  <ShieldCheck size={15} /><span>管理員</span>
                </button>
              )}
              <button type="button" onClick={onSignOut} aria-label="登出" title="登出">
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" aria-label="關閉導覽" onClick={() => setMobileNavOpen(false)} />}

      <section className="note-column" aria-label="筆記清單">
        <header className="list-header">
          <div className="mobile-topline">
            <button className="icon-button mobile-menu" type="button" aria-label="開啟導覽" onClick={() => setMobileNavOpen(true)}>
              <Menu size={19} />
            </button>
            <span className="mobile-brand">紙嶼</span>
          </div>
          <div className="list-title-row">
            <div>
              <div className="eyebrow">你的知識空間</div>
              <h1>{viewTitle}</h1>
            </div>
            <button className="icon-button list-new-button" type="button" aria-label="新增筆記" title="新增筆記" onClick={createNewNote}>
              <Plus size={19} />
            </button>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input
              ref={searchRef}
              aria-label="搜尋筆記"
              placeholder="搜尋標題、內容或標籤"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button className="search-clear" type="button" aria-label="清除搜尋" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            ) : (
              <kbd>⌘ K</kbd>
            )}
          </label>
          <div className="list-toolbar">
            <span>{visibleNotes.length} 篇筆記</span>
            <button className="sort-button" type="button" aria-label="排序：最近更新" title="依最近更新排序">
              <List size={15} />
              <span>最近更新</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        <div className="note-list" role={visibleNotes.length > 0 ? "list" : undefined}>
          {visibleNotes.map((note) => (
            <div className="note-list-item" role="listitem" key={note.id}>
              <button
                className={`note-card ${selectedNote?.id === note.id ? "note-card-active" : ""}`}
                type="button"
                aria-current={selectedNote?.id === note.id ? "true" : undefined}
                onClick={() => {
                  setSelectedId(note.id);
                  setSelectionDismissed(false);
                  setPreview(false);
                  setMobileNavOpen(false);
                }}
              >
                <span className="note-card-topline">
                  <span className="note-card-title">{noteLabel(note)}</span>
                  <span className="note-card-markers">
                    {note.isPinned && <Pin size={13} aria-label="已置頂" />}
                    {note.isFavorite && <Heart size={13} aria-label="已收藏" />}
                  </span>
                </span>
                <span className="note-card-excerpt">
                  {note.content.replace(/[#>*_`~\[\]()]/g, "").trim() || "開始寫下你的想法…"}
                </span>
                <span className="note-card-bottomline">
                  <span>{formatDate(note.updatedAt)}</span>
                  {note.tags.slice(0, 2).map((tag) => <span className="mini-tag" key={tag}>{tag}</span>)}
                </span>
              </button>
            </div>
          ))}
          {visibleNotes.length === 0 && (
            <div className="list-empty-state">
              <div className="empty-mark"><FileText size={23} /></div>
              <strong>{deferredQuery ? "找不到符合的筆記" : view === "trash" ? "垃圾桶是空的" : "這裡還沒有筆記"}</strong>
              <span>{deferredQuery ? "試試其他關鍵字，或清除搜尋。" : "先記下來，整理可以稍後再做。"}</span>
              {!deferredQuery && view !== "trash" && (
                <button type="button" className="text-action" onClick={createNewNote}>
                  <Plus size={15} /> 新增第一篇筆記
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="list-footer">
          <span className={`save-indicator ${saveState}`}>
            <span className="save-dot" />
            {saveState === "loading" ? "載入中" : saveState === "saving" ? "儲存中" : saveState === "error" ? "儲存有問題" : "已儲存"}
          </span>
          <span>{localAccount ? "本機 SQLite" : "本機展示"}</span>
        </footer>
      </section>

      <section className="editor-column" aria-label="筆記編輯器">
        {storageIssue && (
          <div className="storage-warning" role="alert">
            <strong>{localAccount ? "無法讀取本機資料庫" : "無法讀取本機資料"}</strong>
            <span>{storageError || "為避免覆蓋既有內容，已暫停寫入。請修復資料後重新載入。"}</span>
            <button type="button" onClick={() => window.location.reload()}>重新載入</button>
          </div>
        )}
        {selectedNote ? (
          <>
            <header className="editor-header">
              <button className="icon-button editor-back" type="button" aria-label="返回筆記清單" onClick={() => { setSelectedId(null); setSelectionDismissed(true); }}>
                <ArrowLeft size={18} />
              </button>
              <div className="editor-breadcrumb">
                <span>{viewTitle}</span>
                <span className="breadcrumb-divider">/</span>
                <span className="breadcrumb-current">{noteLabel(selectedNote)}</span>
              </div>
              <div className="editor-actions">
                {view === "trash" ? (
                  <>
                    <button className="action-button restore-button" type="button" onClick={() => setWorkspace((current) => ({ ...current, notes: restoreNote(current.notes, selectedNote.id, new Date().toISOString()) }))}>
                      <ArrowLeft size={16} /><span>還原</span>
                    </button>
                    <button className="icon-button danger-icon" type="button" aria-label="永久刪除筆記" title="永久刪除" onClick={() => permanentlyDelete(selectedNote)}>
                      <Trash2 size={17} />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="icon-button" type="button" aria-label={selectedNote.isFavorite ? "取消收藏" : "加入收藏"} title={selectedNote.isFavorite ? "取消收藏" : "加入收藏"} onClick={() => changeNote(selectedNote.id, { isFavorite: !selectedNote.isFavorite })}>
                      <Heart size={17} fill={selectedNote.isFavorite ? "currentColor" : "none"} />
                    </button>
                    <button className="icon-button" type="button" aria-label={selectedNote.isPinned ? "取消置頂" : "置頂筆記"} title={selectedNote.isPinned ? "取消置頂" : "置頂筆記"} onClick={() => changeNote(selectedNote.id, { isPinned: !selectedNote.isPinned })}>
                      <Pin size={17} fill={selectedNote.isPinned ? "currentColor" : "none"} />
                    </button>
                    <button className="icon-button" type="button" aria-label={selectedNote.archivedAt ? "取消封存" : "封存筆記"} title={selectedNote.archivedAt ? "取消封存" : "封存筆記"} onClick={() => setWorkspace((current) => ({ ...current, notes: setArchived(current.notes, selectedNote.id, !selectedNote.archivedAt, new Date().toISOString()) }))}>
                      <Archive size={17} />
                    </button>
                    <button className="icon-button danger-icon" type="button" aria-label="移至垃圾桶" title="移至垃圾桶" onClick={() => trashNote(selectedNote)}>
                      <Trash2 size={17} />
                    </button>
                    <span className="action-divider" />
                    <button className="icon-button" type="button" aria-label="匯出 Markdown" title="匯出 Markdown" onClick={() => downloadFile(`${noteLabel(selectedNote)}.md`, exportNoteMarkdown(selectedNote), "text/markdown;charset=utf-8")}>
                      <ArrowDownToLine size={17} />
                    </button>
                    <button className="icon-button" type="button" aria-label="更多筆記操作" title="更多筆記操作" onClick={() => downloadFile("noteisle-backup.json", exportWorkspace(workspace), "application/json")}>
                      <MoreHorizontal size={18} />
                    </button>
                  </>
                )}
              </div>
            </header>

            <div className="editor-scroll-area">
              <div className="editor-document">
                <input
                  ref={titleRef}
                  className="title-input"
                  aria-label="筆記標題"
                  placeholder="未命名筆記"
                  value={selectedNote.title}
                  disabled={Boolean(selectedNote.deletedAt) || storageIssue}
                  onChange={(event) => changeNote(selectedNote.id, { title: event.target.value })}
                />
                <div className="note-meta-row">
                  <span className="meta-date"><Sparkles size={14} /> 最近更新於 {formatDate(selectedNote.updatedAt)}</span>
                  <label className="folder-select-wrap">
                    <Folder size={14} />
                    <select
                      aria-label="筆記資料夾"
                      value={selectedNote.folderId ?? ""}
                      disabled={Boolean(selectedNote.deletedAt) || storageIssue}
                      onChange={(event) => changeNote(selectedNote.id, { folderId: event.target.value || null })}
                    >
                      <option value="">未分類</option>
                      {workspace.folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                </div>

                <div className="tag-editor-row">
                  <div className="note-tags">
                    {selectedNote.tags.map((tag) => (
                      <button
                        className="note-tag"
                        type="button"
                        key={tag}
                        aria-label={`移除標籤 ${tag}`}
                        onClick={() => changeNote(selectedNote.id, { tags: selectedNote.tags.filter((item) => item !== tag) })}
                      >
                        {tag}<X size={12} />
                      </button>
                    ))}
                    {!selectedNote.deletedAt && (
                      <form className="add-tag-form" onSubmit={addTag}>
                        <input
                          aria-label="新增標籤"
                          placeholder={selectedNote.tags.length ? "＋ 標籤" : "＋ 新增標籤"}
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                        />
                      </form>
                    )}
                  </div>
                </div>

                <div className="editor-toolbar-row">
                  {view !== "trash" && (
                    <div className="format-toolbar" role="toolbar" aria-label="Markdown 格式工具">
                      <button type="button" aria-label="標題格式" title="標題" onClick={() => insertMarkdown("## ")}><span className="toolbar-heading">H</span></button>
                      <button type="button" aria-label="粗體格式" title="粗體" onClick={() => insertMarkdown("**", "**")}><strong>B</strong></button>
                      <button type="button" aria-label="清單格式" title="清單" onClick={() => insertMarkdown("- ")}><List size={16} /></button>
                      <button type="button" aria-label="連結格式" title="連結" onClick={() => insertMarkdown("[", "](https://)")}><span className="toolbar-link">↗</span></button>
                    </div>
                  )}
                  <div className="view-switch" role="group" aria-label="編輯或預覽">
                    <button className={!preview ? "view-switch-active" : ""} type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>編輯</button>
                    <button className={preview ? "view-switch-active" : ""} type="button" aria-pressed={preview} onClick={() => setPreview(true)}>預覽</button>
                  </div>
                </div>

                {preview ? (
                  <article className="markdown-preview" aria-label="Markdown 預覽">
                    {selectedNote.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNote.content}</ReactMarkdown>
                    ) : (
                      <p className="preview-placeholder">還沒有內容。切回編輯，開始寫下第一個想法。</p>
                    )}
                  </article>
                ) : (
                  <textarea
                    ref={contentRef}
                    className="markdown-editor"
                    aria-label="筆記內容"
                    placeholder="從一句話開始…\n\n支援 Markdown。先記下來，整理可以稍後再做。"
                    value={selectedNote.content}
                    disabled={Boolean(selectedNote.deletedAt) || storageIssue}
                    onChange={(event) => changeNote(selectedNote.id, { content: event.target.value })}
                    spellCheck
                  />
                )}
                <div className="editor-bottomline">
                  <span><Check size={13} /> {saveState === "error" ? "儲存失敗" : localAccount ? "變更會自動儲存至 SQLite" : "變更會自動儲存至此裝置"}</span>
                  <span>{selectedNote.content.length} 字元</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="editor-empty">
            <div className="empty-illustration" aria-hidden="true">
              <div className="paper-sheet"><span /><span /><span /><i /></div>
              <div className="paper-sun" />
            </div>
            <div className="editor-empty-copy">
              <span className="eyebrow">留一點空白給想法</span>
              <h2>{view === "trash" ? "垃圾桶裡沒有筆記" : "你的下一個想法，從這裡開始"}</h2>
              <p>不必先想好分類。寫下來，紙嶼會替你記住。</p>
              {view !== "trash" && <button className="primary-action" type="button" onClick={createNewNote}><Plus size={17} /> 新增筆記</button>}
              <div className="shortcut-hint"><kbd>⌘ N</kbd><span>快速新增</span><span className="hint-divider" /><kbd>⌘ K</kbd><span>搜尋筆記</span></div>
            </div>
          </div>
        )}
      </section>

      <input
        ref={importRef}
        className="visually-hidden"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        aria-label="匯入 Markdown 檔案"
        onChange={(event) => void importFile(event.target.files?.[0])}
      />
      <div className="global-actions" aria-label="資料操作">
        <button type="button" aria-label="匯入 Markdown" title="匯入 Markdown" onClick={() => importRef.current?.click()}><FileInput size={16} /></button>
        <button type="button" aria-label="匯出完整備份" title="匯出完整備份" onClick={() => downloadFile("noteisle-backup.json", exportWorkspace(workspace), "application/json")}><ArrowDownToLine size={16} /></button>
      </div>
    </main>
  );
}