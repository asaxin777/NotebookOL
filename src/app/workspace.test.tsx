import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceApp from "@/app/workspace";
import { STORAGE_KEY } from "@/lib/notes";

function renderWorkspace() {
  return render(<WorkspaceApp />);
}

async function createNote(title: string, content = "") {
  const user = userEvent.setup();
  if (!document.body.hasChildNodes()) renderWorkspace();
  await user.click(screen.getAllByRole("button", { name: "新增筆記" })[0]);
  await user.type(screen.getByRole("textbox", { name: "筆記標題" }), title);
  if (content) await user.type(screen.getByRole("textbox", { name: "筆記內容" }), content);
  return user;
}

describe("筆記工作區使用者流程", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "generated-note-id") });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("顯示空白狀態，並讓使用者直接建立第一篇筆記", async () => {
    renderWorkspace();
    expect(await screen.findByText("你的下一個想法，從這裡開始")).toBeInTheDocument();
    await createNote("第一個想法", "先記下來");

    expect(screen.getByRole("textbox", { name: "筆記標題" })).toHaveValue("第一個想法");
    expect(screen.getByRole("textbox", { name: "筆記內容" })).toHaveValue("先記下來");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.notes[0]).toMatchObject({ title: "第一個想法", content: "先記下來" });
    });
  });

  it("搜尋標題與正文，並可清除搜尋回到清單", async () => {
    const user = await createNote("會議紀錄", "搜尋需要支援繁體中文與 English");
    await user.type(screen.getByRole("textbox", { name: "搜尋筆記" }), "English");
    expect(screen.getByRole("button", { name: /會議紀錄/ })).toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "搜尋筆記" }));
    expect(screen.getByRole("button", { name: /會議紀錄/ })).toBeInTheDocument();
  });

  it("建立資料夾、移動筆記並套用標籤篩選", async () => {
    const user = await createNote("研究筆記", "測試分類與標籤");
    await user.click(screen.getByRole("button", { name: "新增資料夾" }));
    await user.type(screen.getByRole("textbox", { name: "資料夾名稱" }), "研究");
    await user.click(screen.getByRole("button", { name: "建立資料夾" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "筆記資料夾" }),
      "generated-note-id",
    );
    await user.type(screen.getByRole("textbox", { name: "新增標籤" }), "測試");
    await user.keyboard("{Enter}");

    await user.click(screen.getByRole("button", { name: "測試" }));
    expect(screen.getByRole("heading", { name: "# 測試" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "筆記標題" })).toHaveValue("研究筆記");
  });

  it("收藏、封存、移至垃圾桶並還原筆記", async () => {
    const user = await createNote("生命週期筆記");
    await user.click(screen.getByRole("button", { name: "加入收藏" }));
    await user.click(screen.getByRole("button", { name: /^收藏/ }));
    expect(screen.getByRole("textbox", { name: "筆記標題" })).toHaveValue("生命週期筆記");

    await user.click(screen.getByRole("button", { name: "封存筆記" }));
    await user.click(screen.getByRole("button", { name: /^封存/ }));
    expect(screen.getByRole("textbox", { name: "筆記標題" })).toHaveValue("生命週期筆記");

    await user.click(screen.getByRole("button", { name: "移至垃圾桶" }));
    await user.click(screen.getByRole("button", { name: /^垃圾桶/ }));
    expect(screen.getByRole("textbox", { name: "筆記標題" })).toHaveValue("生命週期筆記");
    await user.click(screen.getByRole("button", { name: "還原" }));
    expect(await screen.findByText("垃圾桶是空的")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^封存/ }));
    expect(screen.getByRole("button", { name: /生命週期筆記/ })).toBeInTheDocument();
  });

  it("Markdown 預覽不執行或渲染不可信 HTML", async () => {
    const user = await createNote("安全預覽", "<img src=x onerror=alert(1)>\n\n**安全文字**");
    await user.click(screen.getByRole("button", { name: "預覽" }));

    const preview = screen.getByRole("article", { name: "Markdown 預覽" });
    expect(within(preview).queryByRole("img")).not.toBeInTheDocument();
    expect(within(preview).queryByText("安全文字")).toBeInTheDocument();
  });

  it("匯入 Markdown 檔案並將標題和正文放入新筆記", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("你的下一個想法，從這裡開始");
    const file = new File(["# 匯入內容\n\n這是正文"], "note.md", { type: "text/markdown" });

    await user.upload(screen.getByLabelText("匯入 Markdown 檔案"), file);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "筆記標題" })).toHaveValue("匯入內容");
      expect(screen.getByRole("textbox", { name: "筆記內容" })).toHaveValue("這是正文");
    });
  });

  it("Ctrl+K 聚焦搜尋，Ctrl+N 建立筆記", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("你的下一個想法，從這裡開始");
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("textbox", { name: "搜尋筆記" })).toHaveFocus();
    await user.keyboard("{Control>}n{/Control}");
    expect(screen.getByRole("textbox", { name: "筆記標題" })).toHaveFocus();
  });
});