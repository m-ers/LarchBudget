import type { Page } from "@playwright/test";
import { category, clickAway, countAnswers, slowConnection } from "./helpers";
import { expect, test } from "./fixtures";

// The icon at the start of a category's row, and the grid it is chosen from.

test.use({ app: { seed: true } });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(category(page, "Groceries")).toBeVisible();
});

/** Short enough to be sure the icon changed before the server could have answered. */
const AT_ONCE = { timeout: 1_000 };

/** The icon at the start of a category's row, which opens the grid. */
const iconButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `Choose an icon for ${name}`, exact: true });

const picker = (page: Page) => page.getByRole("menu", { name: /^Choose an icon for / });

const choice = (page: Page, name: string) => page.getByRole("menuitemradio", { name, exact: true });

/** The drawing in a row's icon button: Lucide names it in its class, e.g. `lucide-house`. */
const drawing = (page: Page, name: string, icon: string) =>
  iconButton(page, name).locator(`svg.lucide-${icon}`);

/** Whether a row shows the envelope: no Lucide drawing. */
const showsEnvelope = (page: Page, name: string) =>
  expect(iconButton(page, name).locator("svg.lucide")).toHaveCount(0);

/**
 * Chooses another icon for a category with the pointer, and waits until the
 * server has stored it: the page shows it before that, and a reload in
 * between would lose it.
 */
async function chooseIcon(page: Page, name: string, icon: string) {
  await iconButton(page, name).click();
  const answered = page.waitForResponse((response) => response.request().method() === "POST");
  await choice(page, icon).click();
  await expect(picker(page)).toHaveCount(0);
  await answered;
}

test("a chosen icon shows at once, and is still there after a reload", async ({ page }) => {
  const button = iconButton(page, "Rent");
  await expect(button).toHaveAttribute("title", "Choose icon");
  await expect(button).toHaveAttribute("aria-haspopup", "menu");
  await showsEnvelope(page, "Rent");

  // The envelope comes first, marked as the current one.
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(picker(page)).toHaveAccessibleName("Choose an icon for Rent");
  await expect(picker(page).getByRole("menuitemradio").first()).toHaveAccessibleName("Envelope");
  await expect(choice(page, "Envelope")).toHaveAttribute("aria-checked", "true");
  await expect(choice(page, "House")).toHaveAttribute("aria-checked", "false");

  await slowConnection(page, 2_000);
  const answers = countAnswers(page);
  await choice(page, "House").click();
  await expect(picker(page)).toHaveCount(0);
  await expect(drawing(page, "Rent", "house")).toBeVisible(AT_ONCE);
  expect(answers()).toBe(0);
  await expect.poll(answers, { timeout: 20_000 }).toBe(1);

  await page.reload();
  await expect(drawing(page, "Rent", "house")).toBeVisible();
  await iconButton(page, "Rent").click();
  await expect(choice(page, "House")).toHaveAttribute("aria-checked", "true");
  await expect(choice(page, "Envelope")).toHaveAttribute("aria-checked", "false");
  // Only that row changed.
  await showsEnvelope(page, "Groceries");
});

test("the grid works from the keyboard", async ({ page }) => {
  const button = iconButton(page, "Groceries");
  await button.focus();

  // Enter opens it on the current icon; the arrows move through the grid of
  // eight to a row, Home and End jump.
  await page.keyboard.press("Enter");
  await expect(choice(page, "Envelope")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(choice(page, "House")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choice(page, "TV")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(choice(page, "Phone")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(choice(page, "Envelope")).toBeFocused();
  await page.keyboard.press("End");
  await expect(choice(page, "Shirt")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(choice(page, "Envelope")).toBeFocused();

  // Enter chooses, closes the grid and goes back to the button.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(choice(page, "Shopping cart")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(picker(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(drawing(page, "Groceries", "shopping-cart")).toBeVisible();

  // Space opens it on the icon now chosen; Escape closes it and goes back to the button.
  await page.keyboard.press("Space");
  await expect(choice(page, "Shopping cart")).toBeFocused();
  await expect(choice(page, "Shopping cart")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(drawing(page, "Groceries", "shopping-cart")).toBeVisible();

  // The down arrow opens it too, and Space chooses; Tab closes it and moves on to the name.
  await page.keyboard.press("ArrowDown");
  await expect(choice(page, "Shopping cart")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(picker(page)).toHaveCount(0);
  await expect(drawing(page, "Groceries", "utensils")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(picker(page)).toHaveCount(0);
  await expect(category(page, "Groceries")).toBeFocused();
});

test("opened with a click, the arrow keys start at the current icon", async ({ page }) => {
  await chooseIcon(page, "Holiday", "Palm tree");
  await iconButton(page, "Holiday").click();
  await page.keyboard.press("ArrowRight");
  await expect(choice(page, "Palm tree")).toBeFocused();
});

test("a click elsewhere, or on the button again, closes the grid", async ({ page }) => {
  await iconButton(page, "Rent").click();
  await expect(picker(page)).toBeVisible();
  await clickAway(page);
  await expect(picker(page)).toHaveCount(0);

  await iconButton(page, "Rent").click();
  await expect(picker(page)).toBeVisible();
  await iconButton(page, "Rent").click();
  await expect(picker(page)).toHaveCount(0);
  await showsEnvelope(page, "Rent");
});

test("Envelope goes back to the envelope", async ({ page }) => {
  await chooseIcon(page, "Holiday", "Palm tree");
  await expect(drawing(page, "Holiday", "tree-palm")).toBeVisible();

  await chooseIcon(page, "Holiday", "Envelope");
  await showsEnvelope(page, "Holiday");
  await page.reload();
  await expect(category(page, "Holiday")).toBeVisible();
  await showsEnvelope(page, "Holiday");
});

test("an income category gets an icon too, in its grey", async ({ page }) => {
  await chooseIcon(page, "Salary", "Briefcase");
  await expect(drawing(page, "Salary", "briefcase")).toHaveAttribute("stroke", "#8a8d96");
  await page.reload();
  await expect(drawing(page, "Salary", "briefcase")).toBeVisible();
});

test("an icon keeps its group's colour", async ({ page }) => {
  // Fixed costs is the first group, in the first colour of the palette.
  await chooseIcon(page, "Transport", "Car");
  await expect(drawing(page, "Transport", "car")).toHaveAttribute("stroke", "#2a78d6");
});

test.describe("at the bottom of a page longer than the window", () => {
  test.use({ viewport: { width: 1280, height: 420 } });

  test("the grid opens upwards, inside the window", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const button = iconButton(page, "Emergency fund");
    await button.click();
    const box = (await picker(page).boundingBox())!;
    const anchor = (await button.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(anchor.y);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });
});
