import type { Page } from "@playwright/test";
import {
  addGroup,
  category,
  countAnswers,
  groupHeading,
  openGroupMenu,
  slowConnection,
} from "./helpers";
import { expect, test } from "./fixtures";

// The colour of a group, chosen from the swatches in its menu.

test.use({ app: { seed: true } });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(category(page, "Groceries")).toBeVisible();
});

const BLUE = "rgb(42, 120, 214)";
const ORANGE = "rgb(235, 104, 52)";
const VIOLET = "rgb(98, 80, 214)";
const GREY = "rgb(138, 141, 150)";

const swatch = (page: Page, name: string) => page.getByRole("menuitemradio", { name, exact: true });

/** The colour of the icon at the start of a category's row: the envelope's outline, or the drawing's stroke. */
const iconColor = (page: Page, name: string) =>
  page
    .getByRole("button", { name: `Choose an icon for ${name}`, exact: true })
    .locator("svg")
    .evaluate((svg) => getComputedStyle(svg.querySelector("rect, path") ?? svg).stroke);

/** Chooses a colour with the pointer, and waits until the server has stored it. */
async function chooseColor(page: Page, group: string, name: string) {
  await openGroupMenu(page, group);
  const answered = page.waitForResponse((response) => response.request().method() === "POST");
  await swatch(page, name).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await answered;
}

test("a chosen colour shows at once on the group's categories, and stays after a reload", async ({
  page,
}) => {
  // Fixed costs is the first group, in blue; Everyday the second, in orange.
  await expect.poll(() => iconColor(page, "Groceries")).toBe(ORANGE);

  await slowConnection(page, 2_000);
  const answers = countAnswers(page);
  await openGroupMenu(page, "Everyday");
  await swatch(page, "Violet").click();
  await expect.poll(() => iconColor(page, "Groceries"), { timeout: 1_000 }).toBe(VIOLET);
  await expect.poll(() => iconColor(page, "Eating out"), { timeout: 1_000 }).toBe(VIOLET);
  expect(answers()).toBe(0);
  // Only that group changed.
  await expect.poll(() => iconColor(page, "Rent")).toBe(BLUE);
  await expect.poll(answers, { timeout: 20_000 }).toBe(1);

  await page.reload();
  await expect.poll(() => iconColor(page, "Groceries")).toBe(VIOLET);
  await openGroupMenu(page, "Everyday");
  await expect(swatch(page, "Violet")).toHaveAttribute("aria-checked", "true");
});

test("the menu marks the current colour, and names every colour", async ({ page }) => {
  await openGroupMenu(page, "Everyday");
  const names = ["Blue", "Orange", "Aqua", "Yellow", "Magenta", "Violet"];
  await expect(page.getByRole("menuitemradio")).toHaveCount(6);
  for (const name of names) {
    await expect(swatch(page, name)).toHaveAttribute("title", name);
    await expect(swatch(page, name)).toHaveAttribute(
      "aria-checked",
      name === "Orange" ? "true" : "false",
    );
  }
  await expect(page.getByRole("group", { name: "Colour of the group" })).toBeVisible();
  // Only the current one has a ring.
  const ring = (name: string) =>
    swatch(page, name)
      .locator("span")
      .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await ring("Orange")).not.toBe("none");
  expect(await ring("Blue")).toBe("none");
});

test("choosing the colour a group has already changes nothing", async ({ page }) => {
  await openGroupMenu(page, "Everyday");
  await swatch(page, "Orange").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect.poll(() => iconColor(page, "Groceries")).toBe(ORANGE);
});

test("two groups may share a colour", async ({ page }) => {
  await chooseColor(page, "Everyday", "Blue");
  await expect.poll(() => iconColor(page, "Rent")).toBe(BLUE);
  await expect.poll(() => iconColor(page, "Groceries")).toBe(BLUE);
});

test("it works from the keyboard", async ({ page }) => {
  const button = page.getByRole("button", { name: "Actions for the group Everyday", exact: true });
  await groupHeading(page, "Everyday").hover();
  await button.focus();

  // Enter opens the menu on the swatches, at the current colour.
  await page.keyboard.press("Enter");
  await expect(swatch(page, "Orange")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(swatch(page, "Aqua")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(swatch(page, "Blue")).toBeFocused();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await expect(swatch(page, "Violet")).toBeFocused();

  // Down goes on to the items, and up comes back to the row.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(swatch(page, "Orange")).toBeFocused();

  // Enter chooses, closes the menu and goes back to the button.
  await page.keyboard.press("ArrowRight");
  await expect(swatch(page, "Aqua")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect.poll(() => iconColor(page, "Groceries")).toBe("rgb(27, 175, 122)");

  // Space chooses too.
  await page.keyboard.press("Enter");
  await expect(swatch(page, "Aqua")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect.poll(() => iconColor(page, "Groceries")).toBe("rgb(232, 123, 164)");
});

test("a seventh group, which is grey, can get a colour", async ({ page }) => {
  for (const name of ["Fun", "Gifts", "Pets"]) await addGroup(page, name);
  await addGroup(page, "Seventh");
  // Needs a category to show the colour.
  await page.getByRole("button", { name: "Add a category to Seventh" }).click();
  await page.getByRole("textbox", { name: "New category in Seventh" }).fill("Snacks");
  await page.keyboard.press("Enter");
  await expect(category(page, "Snacks")).toBeVisible();
  await expect.poll(() => iconColor(page, "Snacks")).toBe(GREY);

  await openGroupMenu(page, "Seventh");
  await expect(page.locator("[role=menuitemradio][aria-checked=true]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await chooseColor(page, "Seventh", "Violet");
  await expect.poll(() => iconColor(page, "Snacks")).toBe(VIOLET);
  await page.reload();
  await expect.poll(() => iconColor(page, "Snacks")).toBe(VIOLET);
});
