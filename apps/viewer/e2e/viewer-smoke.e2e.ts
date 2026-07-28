import { expect, test } from "@playwright/test";

test("Viewerで画面要素とComponent内部Fieldを確認できる", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?screen=user-list");

  await expect(page.getByRole("heading", { level: 1, name: "ユーザー一覧画面" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "読み込みエラー" })).toHaveCount(0);
  await expect.poll(() => page.locator(".design-reference").evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  await expect.poll(() => page.locator(".field-review-main").evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  await page.getByRole("button", { name: /Design Tourを開始/ }).click();
  await expect(page.getByLabel("Design Tour")).toContainText("Design Tour 1 / 8");
  const appHeaderRow = page.locator('[data-screen-element="appHeader"]');
  await expect(appHeaderRow).toBeFocused();
  await expect(appHeaderRow).toHaveClass(/tour-focused/);
  await expect(page.locator(".field-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "次の項目" }).click();
  await expect(page.getByLabel("Design Tour")).toContainText("adminSidebar");
  await expect(page.locator('[data-screen-element="adminSidebar"]')).toBeFocused();
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page.locator(".design-region")).toHaveCount(0);
  await expect(page.locator(".tour-focused")).toHaveCount(0);
  await appHeaderRow.click();
  await expect(page.locator(".field-detail").getByRole("heading", { name: "Component定義" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Component定義を見る" })).toHaveCount(0);
  await page.locator(".field-detail").getByRole("button", { name: "詳細を閉じる" }).click();
  await page.getByRole("button", { name: "「検索する」をコピー" }).click();
  await expect(page.getByRole("button", { name: "「検索する」をコピー" })).toHaveAttribute("data-copied", "true");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("検索する");
  await expect(page.locator(".section-group-row").filter({ hasText: "検索結果" })).toBeVisible();
  await expect(page.getByText("userTable.rows", { exact: true })).toBeVisible();

  await page.getByText("userTable.rows", { exact: true }).click();
  await expect(page.getByRole("heading", { name: /userTable.rows/ })).toBeVisible();
  await expect(page.getByText("data.userRows", { exact: true })).toBeVisible();

  await page.getByRole("searchbox", { name: "要素ID、名称、文言、セクションで検索" }).fill("検索結果");
  await expect(page.locator(".section-group-row").filter({ hasText: "検索結果" })).toBeVisible();
  await expect(page.locator(".section-group-row").filter({ hasText: "検索条件" })).toHaveCount(0);

  await page.goto("/?screen=user-list&tab=states");
  const changePage = page.locator(".event-card").filter({ hasText: "changePage" });
  await expect(changePage.getByText("Event Context", { exact: true })).toBeVisible();
  await expect(changePage.getByText("event.page", { exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
