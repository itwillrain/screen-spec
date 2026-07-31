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
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByText("screen-spec editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "screen", exact: true })).toBeVisible();
  const relatedDocument = page.getByRole("button", { name: /関連 · ui\.yaml/ });
  await expect(relatedDocument).toBeVisible();
  await relatedDocument.click();
  await expect(page.getByRole("button", { name: "components", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /画面 · list\.screen\.yaml/ }).click();
  await page.getByRole("button", { name: "YAML", exact: true }).click();
  const yamlEditor = page.getByRole("textbox", { name: "YAMLを編集" });
  await expect(yamlEditor).toContainText("screen:");
  await yamlEditor.fill((await yamlEditor.inputValue()).replace("ユーザー一覧画面", "ユーザー一覧画面（編集中）"));
  await expect(page.getByText("検証OK")).toBeVisible();
  await page.getByRole("button", { name: "Viewerへ戻る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ユーザー一覧画面" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "読み込みエラー" })).toHaveCount(0);
  await expect.poll(() => page.locator(".design-reference").evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  await expect.poll(() => page.locator(".design-viewport").evaluate((element) => getComputedStyle(element).overflowY)).toBe("hidden");
  await expect(page.getByRole("button", { name: "拡大" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /別タブで開く/ })).toBeVisible();
  await expect.poll(() => page.locator(".design-canvas").evaluate((canvas) => Math.abs(canvas.getBoundingClientRect().width - canvas.querySelector("img")!.getBoundingClientRect().width))).toBeLessThan(1);
  await expect.poll(() => page.locator(".field-review-main").evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  await expect.poll(() => page.locator(".field-review-main > .table-scroll").evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  await expect.poll(() => page.locator(".review-fields thead th").first().evaluate((element) => getComputedStyle(element).position)).toBe("static");
  await page.getByRole("button", { name: /Design Tourを開始/ }).click();
  await expect(page.getByLabel("Design Tour", { exact: true })).toContainText("Design Tour 1 / 8");
  const appHeaderRow = page.locator('[data-screen-element="appHeader"]');
  await expect(appHeaderRow).toBeFocused();
  await expect(appHeaderRow).toHaveClass(/tour-focused/);
  await expect(appHeaderRow.getByLabel("Design Tour 1")).toHaveText("1");
  await expect(page.locator('[data-screen-element="userPagination"]').getByLabel("Design Tour 7")).toHaveText("7");
  await expect(page.locator(".field-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "次の項目" }).click();
  await expect(page.getByLabel("Design Tour", { exact: true })).toContainText("adminSidebar");
  await expect(page.locator('[data-screen-element="adminSidebar"]')).toBeFocused();
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page.locator(".design-region")).toHaveCount(0);
  await expect(page.locator(".tour-focused")).toHaveCount(0);
  await expect(page.locator(".tour-row-number")).toHaveCount(0);
  await appHeaderRow.click();
  await expect(page.locator(".field-detail").getByRole("heading", { name: "Component定義" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Component定義を見る" })).toHaveCount(0);
  await page.locator(".field-detail").getByRole("button", { name: "詳細を閉じる" }).click();
  await page.getByRole("button", { name: "「検索する」をコピー" }).click();
  await expect(page.getByRole("button", { name: "「検索する」をコピー" })).toHaveAttribute("data-copied", "true");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("検索する");
  await expect(page.locator(".section-group-row").filter({ hasText: "検索結果" })).toBeVisible();
  await expect(page.getByText("userTable.rows", { exact: true })).toBeVisible();
  const longElementId = page.locator(".element-id", { hasText: "userTable.header" });
  await expect.poll(() => longElementId.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
  await expect.poll(() => longElementId.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(30);

  const eventLink = page.locator(".review-fields .event-id").first();
  const eventId = (await eventLink.textContent())!;
  await eventLink.click();
  await expect(page.getByRole("tab", { name: "状態遷移", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".event-card.selected-event")).toHaveAttribute("data-event-id", eventId);
  await expect(page.locator(".event-card.selected-event")).toBeFocused();
  await expect(page).toHaveURL(new RegExp("event=" + eventId));
  await page.goBack();
  await expect(page.getByRole("tab", { name: "項目", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "状態遷移", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".event-card.selected-event")).toHaveAttribute("data-event-id", eventId);
  await page.getByRole("button", { name: "項目へ戻る" }).click();
  await expect(page.getByRole("tab", { name: "項目", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/event=/);

  await page.getByText("userTable.rows", { exact: true }).click();
  await expect(page.getByRole("heading", { name: /userTable.rows/ })).toBeVisible();
  await expect(page.getByText("data.userRows", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "次の項目" }).click();
  await expect(page.locator(".field-detail > header h2")).not.toContainText("userTable.rows");
  await page.getByRole("button", { name: "詳細ペインの外側をクリックして閉じる" }).click({ position: { x: 10, y: 10 } });
  await expect(page.locator(".field-detail")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "要素ID、名称、文言、セクションで検索" }).fill("検索結果");
  await expect(page.locator(".section-group-row").filter({ hasText: "検索結果" })).toBeVisible();
  await expect(page.locator(".section-group-row").filter({ hasText: "検索条件" })).toHaveCount(0);

  await page.goto("/?screen=user-list&tab=states");
  const onLoaded = page.locator(".event-card").filter({ hasText: "onLoaded" });
  await onLoaded.getByText("処理の詳細", { exact: true }).click();
  await expect(onLoaded.getByText("実行する処理", { exact: true })).toBeVisible();
  const changePage = page.locator('.event-card[data-event-id="changePage"]');
  await changePage.getByText("処理の詳細", { exact: true }).click();
  await expect(changePage.getByText("Event Context", { exact: true })).toBeVisible();
  await expect(changePage.getByText("event.page", { exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
