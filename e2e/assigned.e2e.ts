import type { Page } from "@playwright/test";
import {
  addAccount,
  addCategories,
  addGroup,
  alert,
  assign,
  assignedField,
  available,
  clickAway,
  countAnswers,
  groupTotal,
  headerFigure,
  slowConnection,
  spentLine,
} from "./budget-page";
import { expect, test } from "./fixtures";

// The Assigned column: what a new amount shows, and when.

/** Short enough to be sure a figure changed before the server could have answered. */
const AT_ONCE = { timeout: 1_000 };

/** Records every text the big header figure shows from now on. */
async function recordHeaderFigure(page: Page): Promise<() => Promise<string[]>> {
  const figure = await headerFigure(page).elementHandle();
  await figure!.evaluate((element) => {
    const shown = [element.textContent];
    new MutationObserver(() => {
      if (shown.at(-1) !== element.textContent) shown.push(element.textContent);
    }).observe(element, { subtree: true, childList: true, characterData: true });
    (window as unknown as { shown: typeof shown }).shown = shown;
  });
  return () => page.evaluate(() => (window as unknown as { shown: string[] }).shown);
}

test.describe("on a slow connection", () => {
  test.beforeEach(async ({ page }) => {
    await addAccount(page, "Main account", "2500");
    await page.goto("/");
    await addGroup(page, "Fixed costs");
    await addCategories(page, "Fixed costs", ["Rent", "Utilities", "Insurance", "Internet"]);
    // The figure shows before the server answers, so wait for the answer too.
    const answers = countAnswers(page);
    await assign(page, "Utilities", "95");
    await expect(headerFigure(page)).toHaveText("€2,405.00");
    await expect.poll(answers).toBe(1);
  });

  test("a new amount and every figure it moves show before the server answers", async ({
    page,
  }) => {
    await slowConnection(page, 2_000);
    const answers = countAnswers(page);

    await assign(page, "Rent", "1100");
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00", AT_ONCE);
    await expect(available(page, "Rent")).toHaveText("€1,100.00", AT_ONCE);
    await expect(groupTotal(page, "Fixed costs")).toHaveText("€1,195.00", AT_ONCE);
    await expect(spentLine(page)).toContainText("spent of €1,195 assigned", AT_ONCE);
    await expect(headerFigure(page)).toHaveText("€1,305.00", AT_ONCE);
    await expect(page.getByText("Ready to assign", { exact: true })).toBeVisible(AT_ONCE);
    expect(answers()).toBe(0);

    // The label and its tone follow the figure.
    await assign(page, "Insurance", "1805");
    await expect(headerFigure(page)).toHaveText("-€500.00", AT_ONCE);
    await expect(page.getByText("Assigned more than you have")).toBeVisible(AT_ONCE);
    await assign(page, "Insurance", "1305");
    await expect(headerFigure(page)).toHaveText("€0.00", AT_ONCE);
    await expect(page.getByText("Every cent is assigned")).toBeVisible(AT_ONCE);
    expect(answers()).toBe(0);

    // The server's figures agree once they arrive.
    await expect.poll(answers, { timeout: 20_000 }).toBe(3);
    await page.reload();
    await expect(headerFigure(page)).toHaveText("€0.00");
    await expect(assignedField(page, "Insurance")).toHaveValue("1,305.00");
    await expect(groupTotal(page, "Fixed costs")).toHaveText("€2,500.00");
  });

  test("four quick changes all show at once, and the figures never go back", async ({ page }) => {
    const shown = await recordHeaderFigure(page);
    await slowConnection(page, 400);
    const answers = countAnswers(page);

    await assignedField(page, "Rent").click();
    for (const amount of ["1000", "200", "50", "40"]) {
      await page.keyboard.type(amount);
      await page.keyboard.press("Enter");
    }
    await expect(assignedField(page, "Rent")).toHaveValue("1,000.00", AT_ONCE);
    await expect(assignedField(page, "Utilities")).toHaveValue("200.00", AT_ONCE);
    await expect(assignedField(page, "Insurance")).toHaveValue("50.00", AT_ONCE);
    await expect(assignedField(page, "Internet")).toHaveValue("40.00", AT_ONCE);
    await expect(headerFigure(page)).toHaveText("€1,210.00", AT_ONCE);

    await expect.poll(answers, { timeout: 20_000 }).toBe(4);
    await expect(headerFigure(page)).toHaveText("€1,210.00");
    await expect(groupTotal(page, "Fixed costs")).toHaveText("€1,290.00");
    expect(await shown()).toEqual([
      "€2,405.00",
      "€1,405.00",
      "€1,300.00",
      "€1,250.00",
      "€1,210.00",
    ]);
  });

  test("a save that lands while the field is edited again keeps what is being typed", async ({
    page,
  }) => {
    await slowConnection(page, 1_500);
    const answers = countAnswers(page);
    const field = assignedField(page, "Rent");

    await field.click();
    await page.keyboard.type("100");
    await clickAway(page);
    await field.click();
    await page.keyboard.type("25");
    await expect.poll(answers, { timeout: 20_000 }).toBe(1);
    // Give the answer time to reach the field.
    await page.waitForTimeout(500);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("25");

    await clickAway(page);
    await expect(field).toHaveValue("25.00");
    await expect(available(page, "Rent")).toHaveText("€25.00");
  });

  test("an amount the server refuses goes back, with the reason", async ({ page }) => {
    await slowConnection(page, 1_500);

    await assign(page, "Rent", "2000000000");
    await expect(headerFigure(page)).toHaveText("-€1,999,997,595.00", AT_ONCE);
    await expect(alert(page, "That is not an amount.")).toBeVisible({ timeout: 10_000 });
    await expect(assignedField(page, "Rent")).toHaveValue("");
    await expect(available(page, "Rent")).toHaveText("€0.00");
    await expect(headerFigure(page)).toHaveText("€2,405.00");
  });
});

test("a save while LarchBudget cannot be reached puts the old amount back, and keeps what was typed", async ({
  page,
  server,
}) => {
  await addAccount(page, "Main account", "100");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries"]);
  const answers = countAnswers(page);
  await assign(page, "Groceries", "40");
  await expect(headerFigure(page)).toHaveText("€60.00");
  await expect.poll(answers).toBe(1);

  await server.stop();
  await assign(page, "Groceries", "123");
  await expect(
    alert(page, "Could not reach LarchBudget. Check your connection and try again."),
  ).toBeVisible();
  await expect(assignedField(page, "Groceries")).toHaveValue("40.00");
  await expect(available(page, "Groceries")).toHaveText("€40.00");
  await expect(headerFigure(page)).toHaveText("€60.00");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Editing again starts from what was typed, so it can be corrected or sent again.
  await assignedField(page, "Groceries").click();
  await expect(assignedField(page, "Groceries")).toHaveValue("123");
  await page.keyboard.press("Escape");
  await expect(alert(page, "Could not reach LarchBudget")).toHaveCount(0);
  await expect(assignedField(page, "Groceries")).toHaveValue("40.00");
});
