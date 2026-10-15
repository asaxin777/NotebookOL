import { expect, test } from "@playwright/test";
import { createLocalAccount, LOCAL_TEST_PASSWORD } from "./local-account";

test("registers a local account, persists its session, and allows login again", async ({ page }) => {
  const email = await createLocalAccount(page);
  await page.getByRole("button", { name: "登出" }).click();

  await expect(page.getByRole("heading", { name: "歡迎回來" })).toBeVisible();
  await page.getByRole("textbox", { name: "電子郵件" }).fill(email);
  await page.getByLabel("密碼").fill(LOCAL_TEST_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await expect(page.getByRole("heading", { name: "全部筆記" })).toBeVisible();
  await expect(page.getByTitle(email)).toBeVisible();
});

test("shows a clear error for invalid local account credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "電子郵件" }).fill("missing@example.test");
  await page.getByLabel("密碼").fill(LOCAL_TEST_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await expect(page.getByText("電子郵件或密碼不正確。", { exact: true })).toBeVisible();
});

test("a second local account cannot access the first account's notes", async ({ page }) => {
  await createLocalAccount(page);
  const privateTitle = `私人筆記 ${Date.now()}`;
  await page.getByRole("button", { name: "新增第一篇筆記" }).click();
  await page.getByRole("textbox", { name: "筆記標題" }).fill(privateTitle);
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch("/api/local-workspace");
    return JSON.stringify(await response.json());
  })).toContain(privateTitle);
  await page.getByRole("button", { name: "登出" }).click();

  await createLocalAccount(page);
  const workspace = await page.evaluate(async () => {
    const response = await fetch("/api/local-workspace");
    return await response.json();
  });
  expect(workspace.notes).toEqual([]);
  await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(0);
});
