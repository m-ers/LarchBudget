import {
  available,
  categoriesIn,
  category,
  groupMenuButton,
  groupNames,
  groupTotal,
  headerFigure,
  menuButton,
  menuItem,
  openGroupMenu,
  openMenu,
} from "./budget-page";
import { expect, test } from "./fixtures";

// Putting categories and groups in another order, and categories in another group.

test.use({ app: { seed: true } });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(category(page, "Groceries")).toBeVisible();
});

test("a category moves up and down within its group", async ({ page }) => {
  await openMenu(page, "Rent");
  // The first cannot go further up.
  await expect(menuItem(page, "Move up")).toHaveAttribute("aria-disabled", "true");
  await menuItem(page, "Move down").click();
  await expect
    .poll(() => categoriesIn(page, "Fixed costs"))
    .toEqual(["Utilities", "Rent", "Transport"]);

  // From the keyboard, the focus stays on the moved category's menu button.
  await menuButton(page, "Rent").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(menuItem(page, "Move down")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => categoriesIn(page, "Fixed costs"))
    .toEqual(["Utilities", "Transport", "Rent"]);
  await expect(menuButton(page, "Rent")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menuItem(page, "Move down")).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect
    .poll(() => categoriesIn(page, "Fixed costs"))
    .toEqual(["Utilities", "Transport", "Rent"]);
});

test("a category moves to another group with its money", async ({ page }) => {
  const figure = await headerFigure(page).innerText();
  const holds = await available(page, "Groceries").innerText();
  await openMenu(page, "Groceries");
  // One item per other group.
  await expect(menuItem(page, "Move to Everyday")).toHaveCount(0);
  await expect(menuItem(page, "Move to Fixed costs")).toBeVisible();
  await menuItem(page, "Move to Goals").click();

  await expect
    .poll(() => categoriesIn(page, "Goals"))
    .toEqual(["Holiday", "Emergency fund", "Groceries"]);
  await expect.poll(() => categoriesIn(page, "Everyday")).toEqual(["Eating out"]);
  await expect(available(page, "Groceries")).toHaveText(holds);
  await expect(groupTotal(page, "Everyday")).toHaveText(
    await available(page, "Eating out").innerText(),
  );
  await expect(headerFigure(page)).toHaveText(figure);
});

test("a group moves up and down", async ({ page }) => {
  await openGroupMenu(page, "Fixed costs");
  await expect(menuItem(page, "Move up")).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  await openGroupMenu(page, "Goals");
  await expect(menuItem(page, "Move down")).toHaveAttribute("aria-disabled", "true");
  await menuItem(page, "Move up").click();
  await expect.poll(() => groupNames(page)).toEqual(["Fixed costs", "Goals", "Everyday"]);
  // Its categories go with it.
  await expect.poll(() => categoriesIn(page, "Goals")).toEqual(["Holiday", "Emergency fund"]);

  await groupMenuButton(page, "Goals").focus();
  await page.keyboard.press("Enter");
  await menuItem(page, "Move up").press("Enter");
  await expect.poll(() => groupNames(page)).toEqual(["Goals", "Fixed costs", "Everyday"]);
});
