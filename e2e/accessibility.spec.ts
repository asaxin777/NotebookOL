import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createLocalAccount } from "./local-account";

test("workspace meets automated WCAG 2.1 A/AA checks in its empty state", async ({ page }) => {
  await createLocalAccount(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
  }));

  expect(violations).toEqual([]);
});

test("note editing controls meet automated WCAG 2.1 A/AA checks", async ({ page }) => {
  await createLocalAccount(page);
  await page.getByRole("button", { name: "新增第一篇筆記" }).click();
  await page.getByRole("textbox", { name: "筆記標題" }).fill("可存取的筆記");
  await page.getByRole("textbox", { name: "筆記內容" }).fill("主要內容與編輯控制項");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
  }));

  expect(violations).toEqual([]);
});