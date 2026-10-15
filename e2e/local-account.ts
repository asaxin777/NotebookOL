import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const LOCAL_TEST_PASSWORD = "NoteIsle-test-2026!";

export async function createLocalAccount(page: Page): Promise<string> {
  const email = `noteisle-${randomUUID()}@example.test`;
  await page.goto("/");
  await page.getByRole("button", { name: "建立帳號", exact: true }).click();
  await page.getByRole("textbox", { name: "電子郵件" }).fill(email);
  await page.getByLabel("密碼").fill(LOCAL_TEST_PASSWORD);
  await page.getByRole("button", { name: "建立帳號", exact: true }).click();
  await expect(page.getByRole("heading", { name: "全部筆記" })).toBeVisible();
  await expect(page.getByText("SQLite 本機資料庫")).toBeVisible();
  return email;
}
