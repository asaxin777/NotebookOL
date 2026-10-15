import { expect, test } from "@playwright/test";
import { createLocalAccount } from "./local-account";

test.beforeEach(async ({ page }) => {
  await createLocalAccount(page);
});

test("creates a note, searches its body, and keeps it after reload", async ({ page }) => {
  await page.getByRole("button", { name: "新增第一篇筆記" }).click();
  await page.getByRole("textbox", { name: "筆記標題" }).fill("可持續的會議紀錄");
  await page.getByRole("textbox", { name: "筆記內容" }).fill("決議：搜尋與保存流程需要可重複驗證。");

  await expect(page.getByText("可持續的會議紀錄").first()).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch("/api/local-workspace");
    const workspace = await response.json();
    return JSON.stringify(workspace);
  })).toContain("可持續的會議紀錄");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "筆記標題" })).toHaveValue("可持續的會議紀錄");
  await page.getByRole("textbox", { name: "搜尋筆記" }).fill("可重複驗證");
  await expect(page.getByRole("button", { name: /可持續的會議紀錄/ })).toBeVisible();
});

test("retains tags and folder assignments, then restores a trashed note", async ({ page }) => {
  await page.getByRole("button", { name: "新增第一篇筆記" }).click();
  await page.getByRole("textbox", { name: "筆記標題" }).fill("專案研究");
  await page.getByRole("button", { name: "新增資料夾" }).click();
  await page.getByRole("textbox", { name: "資料夾名稱" }).fill("工作");
  await page.getByRole("button", { name: "建立資料夾" }).click();
  await page.getByRole("combobox", { name: "筆記資料夾" }).selectOption({ label: "工作" });
  await page.getByRole("textbox", { name: "新增標籤" }).fill("計畫");
  await page.getByRole("textbox", { name: "新增標籤" }).press("Enter");
  await page.getByRole("button", { name: "移至垃圾桶" }).click();
  await page.getByRole("button", { name: /^垃圾桶/ }).click();
  await expect(page.getByRole("textbox", { name: "筆記標題" })).toHaveValue("專案研究");
  await page.getByRole("button", { name: "還原" }).click();
  await page.getByRole("button", { name: /^全部筆記/ }).click();

  await expect.poll(async () => {
    const backup = await page.evaluate(async () => {
      const response = await fetch("/api/local-workspace");
      return await response.json();
    });
    return backup.notes.find((note: { title: string }) => note.title === "專案研究")?.deletedAt;
  }).toBeNull();
  const backup = await page.evaluate(async () => {
    const response = await fetch("/api/local-workspace");
    return await response.json();
  });
  expect(backup.notes[0]).toMatchObject({
    title: "專案研究",
    folderId: expect.any(String),
    tags: ["計畫"],
    deletedAt: null,
  });
  expect(backup.folders).toEqual([expect.objectContaining({ name: "工作" })]);
});

test("imports Markdown and renders its preview without interpreting raw HTML", async ({ page }) => {
  await page.getByLabel("匯入 Markdown 檔案").setInputFiles({
    name: "安全筆記.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 安全匯入\n\n**保留格式**\n\n<img src=x onerror=alert(1)>", "utf8"),
  });

  await expect(page.getByRole("textbox", { name: "筆記標題" })).toHaveValue("安全匯入");
  await page.getByRole("button", { name: "預覽" }).click();
  await expect(page.getByText("保留格式", { exact: true })).toBeVisible();
  await expect(page.locator("article img, article script")).toHaveCount(0);
});

test("supports the single-column mobile create and return workflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "新增第一篇筆記" }).click();
  await page.getByRole("textbox", { name: "筆記標題" }).fill("手機快速記錄");
  await expect(page.getByRole("textbox", { name: "筆記內容" })).toBeVisible();
  await page.getByRole("button", { name: "返回筆記清單" }).click();
  await expect(page.getByRole("button", { name: /手機快速記錄/ })).toBeVisible();
});