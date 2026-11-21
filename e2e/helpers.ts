import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Finding things on the pages, and the steps most tests take. Role-based
 * queries skip pages that Next.js keeps mounted but hidden.
 */

/** One of the made-up bank files in `e2e/files`. */
export const bankFile = (name: string) => path.join("e2e", "files", name);

/** The option a picker shows as chosen. */
export const chosen = (picker: Locator) => picker.locator("option:checked");

const exactly = (text: string) =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

/** The big number in the page header, e.g. "€2,500.00". */
export const headerFigure = (page: Page) =>
  page.getByTestId("hero-figure").filter({ visible: true });

export const groupHeading = (page: Page, name: string) =>
  page.getByRole("rowheader").filter({ hasText: exactly(name) });

export const category = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

export const categoryRow = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: category(page, name) });

/** The "⋯" button that opens a category's menu. */
export const menuButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `Actions for ${name}`, exact: true });

/** The "⋯" button that opens a group's menu. */
export const groupMenuButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `Actions for the group ${name}`, exact: true });

/** An item in the open menu. */
export const menuItem = (page: Page, label: string) =>
  page.getByRole("menuitem", { name: label, exact: true });

/** Opens a category's menu with the button that shows when its row is hovered. */
export async function openMenu(page: Page, name: string) {
  await categoryRow(page, name).hover();
  await menuButton(page, name).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** Opens a group's menu with the button that shows when its heading is hovered. */
export async function openGroupMenu(page: Page, name: string) {
  await groupHeading(page, name).hover();
  await groupMenuButton(page, name).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** The Available amount at the end of a category's row. */
export const available = (page: Page, name: string) =>
  categoryRow(page, name).getByRole("cell").last();

/** A group's heading row. Its cells hold the group's Assigned, Spent and Available totals. */
export const groupRow = (page: Page, name: string) => groupHeading(page, name).locator("xpath=..");

/** The names of a group's categories, top to bottom, read from their Assigned fields. */
export const categoriesIn = (page: Page, group: string) =>
  groupRow(page, group)
    .locator("xpath=..")
    .getByRole("textbox", { name: /^Assigned to / })
    .evaluateAll((fields) =>
      fields.map((field) => field.getAttribute("aria-label")!.replace(/^Assigned to /, "")),
    );

/**
 * The names of the groups, top to bottom, as typed (the headings show them
 * in capitals). The Income section is not a group: it has no group menu.
 */
export const groupNames = (page: Page) =>
  page
    .getByRole("rowheader")
    .filter({ has: page.getByRole("button", { name: /^Actions for the group / }) })
    .allTextContents();

/** The Income section of the budget table: its heading and its rows. */
export const incomeSection = (page: Page) =>
  page.getByRole("rowgroup").filter({ has: groupHeading(page, "Income") });

/** The names of the income categories, top to bottom, read from the names you click to rename. */
export const incomeNames = (page: Page) =>
  incomeSection(page).getByTitle("Rename", { exact: true }).allTextContents();

export const newIncomeField = (page: Page) =>
  page.getByRole("textbox", { name: "New income category", exact: true });

/** What a group's categories hold together, at the end of its heading row. */
export const groupTotal = (page: Page, name: string) =>
  groupRow(page, name).getByRole("cell").last();

/**
 * A figure under the month, found by its label ("Received", "Assigned",
 * "Spent", or the same in the page's language): its amount, e.g. "€1,195".
 */
export const overviewFigure = (page: Page, label: string) =>
  page
    .locator("dt")
    .filter({ hasText: exactly(label) })
    .filter({ visible: true })
    .locator("xpath=following-sibling::dd[1]");

/** The line under Received about the month before, e.g. "€2,850 from October". */
export const fromLastMonthLine = (page: Page, received = "Received") =>
  overviewFigure(page, received).locator("xpath=following-sibling::dd");

export const newGroupField = (page: Page) => page.getByRole("textbox", { name: "New group name" });

export const newCategoryField = (page: Page, group: string) =>
  page.getByRole("textbox", { name: `New category in ${group}` });

export const assignedField = (page: Page, name: string) =>
  page.getByRole("textbox", { name: `Assigned to ${name}` });

/** A message about something that went wrong, found by (part of) its text. */
export const alert = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

/** The blur a field gets when the whole window loses focus: it stays the active element. */
export const windowLosesFocus = (page: Page) =>
  page.evaluate(() =>
    document.activeElement?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );

/** A click on the page title, which does nothing, so the field being edited loses focus. */
export const clickAway = (page: Page) => page.getByRole("heading", { level: 1 }).click();

/** Delays every request by `latency` milliseconds, like a slow connection. */
export async function slowConnection(page: Page, latency: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

/** Counts the server's answers to saves from now on. Saves are Server Actions, sent as POST. */
export function countAnswers(page: Page): () => number {
  let answers = 0;
  page.on("response", (response) => {
    if (response.request().method() === "POST") answers++;
  });
  return () => answers;
}

export async function addAccount(page: Page, name: string, balanceToday: string) {
  await page.goto("/accounts");
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("textbox", { name: /^Balance\b/ }).fill(balanceToday);
  await page.getByRole("button", { name: "Add account" }).click();
  // The first cell of a row: the type column can read the same, e.g. "Checking".
  await expect(
    page
      .getByRole("row")
      .locator("td:first-child")
      .filter({ hasText: exactly(name) }),
  ).toBeVisible();
}

export async function addGroup(page: Page, name: string) {
  const field = newGroupField(page);
  await field.fill(name);
  await field.press("Enter");
  await expect(groupHeading(page, name)).toBeVisible();
}

export async function openNewCategory(page: Page, group: string) {
  await groupHeading(page, group).hover();
  await page.getByRole("button", { name: `Add a category to ${group}` }).click();
  await expect(newCategoryField(page, group)).toBeFocused();
}

export async function addCategories(page: Page, group: string, names: string[]) {
  const field = newCategoryField(page, group);
  if (!(await field.isVisible())) await openNewCategory(page, group);
  for (const name of names) {
    await field.fill(name);
    await field.press("Enter");
    await expect(category(page, name)).toBeVisible();
  }
}

/** Adds income categories with the Income section's field, opening it with its "+" if needed. */
export async function addIncomeCategories(page: Page, names: string[]) {
  const field = newIncomeField(page);
  await expect(groupHeading(page, "Income")).toBeVisible();
  if (!(await field.isVisible())) {
    await page.getByRole("button", { name: "Add an income category" }).click();
    await expect(field).toBeFocused();
  }
  for (const name of names) {
    await field.fill(name);
    await field.press("Enter");
    await expect(category(page, name)).toBeVisible();
  }
}

/**
 * From this month to the next, waiting until it is on screen: a page change
 * keeps the old page in view until the new one is ready, and a test that
 * types at once would type into the month it is leaving.
 */
export async function goToNextMonth(page: Page) {
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByRole("link", { name: "This month" })).toBeVisible();
}

/** Back to this month, waiting until it is on screen. */
export async function goToThisMonth(page: Page) {
  await page.getByRole("link", { name: "This month" }).click();
  await expect(page.getByRole("link", { name: "This month" })).toHaveCount(0);
}

export async function assign(page: Page, name: string, amount: string) {
  const field = assignedField(page, name);
  await field.click();
  await field.fill(amount);
  await field.press("Tab");
}

/**
 * Like `assign`, and waits until the server has stored the amount. The page
 * shows it before that, so use this before a step that needs it stored,
 * such as opening another month.
 */
export async function assignAndSave(page: Page, name: string, amount: string) {
  const answered = page.waitForResponse((response) => response.request().method() === "POST");
  await assign(page, name, amount);
  await answered;
}
