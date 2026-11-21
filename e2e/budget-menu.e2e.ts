import {
  alert,
  categoriesIn,
  category,
  categoryRow,
  clickAway,
  groupHeading,
  groupMenuButton,
  menuButton,
  menuItem,
  openGroupMenu,
  openMenu,
} from "./helpers";
import { expect, test } from "./fixtures";

// The menu beside every category and group name.

test.use({ app: { seed: true } });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(category(page, "Groceries")).toBeVisible();
});

test("a row's menu button shows on hover, and opens the row's actions", async ({ page }) => {
  const button = menuButton(page, "Groceries");
  await expect(button).toHaveCSS("opacity", "0");
  await expect(button).toHaveAttribute("aria-haspopup", "menu");
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await categoryRow(page, "Groceries").hover();
  await expect(button).toHaveCSS("opacity", "1");
  await button.click();
  const menu = page.getByRole("menu", { name: "Actions for Groceries" });
  await expect(button).toHaveAttribute("aria-expanded", "true");
  // Archiving comes last, after a rule.
  await expect(menu.getByRole("menuitem").last()).toHaveText("Archive");
  await expect(menu.getByRole("separator")).toHaveCount(1);

  // It stays in view while the pointer moves into the menu.
  await menuItem(page, "Rename").hover();
  await expect(button).toHaveCSS("opacity", "1");

  // A second click closes it.
  await button.click();
  await expect(menu).toHaveCount(0);
});

test("a right-click on a row opens the same menu where the pointer is", async ({ page }) => {
  const spent = categoryRow(page, "Groceries").getByRole("cell").nth(3);
  await spent.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Actions for Groceries" });
  await expect(menu).toBeVisible();
  const cell = (await spent.boundingBox())!;
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThan(cell.x);
  expect(box.x).toBeLessThan(cell.x + cell.width);

  // A field keeps the browser's own menu, for copy and paste.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.getByRole("textbox", { name: "Assigned to Groceries" }).click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("the menu works from the keyboard", async ({ page }) => {
  // The button comes right after the name, and shows while it has focus.
  await category(page, "Groceries").focus();
  await page.keyboard.press("Tab");
  const button = menuButton(page, "Groceries");
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("opacity", "1");

  // Enter opens it on the first item; the arrows move, Home and End jump.
  await page.keyboard.press("Enter");
  await expect(menuItem(page, "Rename")).toBeFocused();
  await page.keyboard.press("End");
  await expect(menuItem(page, "Archive")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menuItem(page, "Rename")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menuItem(page, "Archive")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menuItem(page, "Rename")).toBeFocused();

  // Escape closes it and goes back to the button.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("opacity", "1");

  // Choosing with Enter also goes back to the button afterwards.
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.keyboard.press("ArrowUp");
  await expect(menuItem(page, "Archive")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toBeFocused();

  // Space and the down arrow open it too; Tab closes it and moves on.
  await page.keyboard.press("Space");
  await expect(menuItem(page, "Rename")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowDown");
  await expect(menuItem(page, "Rename")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Assigned to Groceries" })).toBeFocused();
});

test("a click elsewhere closes the menu", async ({ page }) => {
  await openMenu(page, "Groceries");
  await clickAway(page);
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("Rename starts renaming in place", async ({ page }) => {
  await openMenu(page, "Groceries");
  await menuItem(page, "Rename").click();
  const field = page.getByRole("textbox", { name: "Category name" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Groceries");
  await page.keyboard.type("Food");
  await page.keyboard.press("Enter");
  await expect(category(page, "Food")).toBeVisible();
});

test("a group heading has its own menu beside its +", async ({ page }) => {
  const button = groupMenuButton(page, "Everyday");
  await expect(button).toHaveCSS("opacity", "0");
  await openGroupMenu(page, "Everyday");
  const menu = page.getByRole("menu", { name: "Actions for the group Everyday" });
  await expect(menu.getByRole("menuitem").last()).toHaveText("Delete group");

  await menuItem(page, "Rename").click();
  const field = page.getByRole("textbox", { name: "Group name", exact: true });
  await expect(field).toHaveValue("Everyday");
  await page.keyboard.type("Daily");
  await page.keyboard.press("Enter");
  await expect(groupHeading(page, "Daily")).toBeVisible();

  // A right-click on the heading opens it too.
  await groupHeading(page, "Daily").click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Actions for the group Daily" })).toBeVisible();
});

test.describe("at the bottom of a page longer than the window", () => {
  test.use({ viewport: { width: 1280, height: 420 } });

  test("the menu opens upwards, inside the window", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await openMenu(page, "Emergency fund");
    const box = (await page.getByRole("menu").boundingBox())!;
    const button = (await menuButton(page, "Emergency fund").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(button.y);
    expect(box.y).toBeGreaterThanOrEqual(0);

    // Also when opened with a right-click near the bottom edge.
    await page.keyboard.press("Escape");
    const row = (await categoryRow(page, "Emergency fund").boundingBox())!;
    await page.mouse.click(row.x + 600, row.y + row.height - 2, { button: "right" });
    const atPointer = (await page.getByRole("menu").boundingBox())!;
    expect(atPointer.y + atPointer.height).toBeLessThanOrEqual(420);
  });
});

test("Rename from the menu goes back to a name that was refused, and keeps it", async ({
  page,
}) => {
  await category(page, "Groceries").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Rent");
  await page.keyboard.press("Enter");
  await expect(alert(page, 'You already have a category called "Rent".')).toBeVisible();
  const field = page.getByRole("textbox", { name: "Category name" });
  await expect(field).toHaveValue("Rent");

  await menuButton(page, "Groceries").click();
  await menuItem(page, "Rename").click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Rent");
});

test("a category moved to another group by keyboard keeps the focus", async ({ page }) => {
  await menuButton(page, "Groceries").focus();
  await page.keyboard.press("Enter");
  await menuItem(page, "Move to Goals").focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => categoriesIn(page, "Goals")).toContain("Groceries");
  await expect(menuButton(page, "Groceries")).toBeFocused();
});
