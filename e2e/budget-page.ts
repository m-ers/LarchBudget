import { expect, type Page } from "@playwright/test";

/**
 * Finding things on the pages, and the steps most tests take. Role-based
 * queries skip pages that Next.js keeps mounted but hidden.
 */

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

/** The Available amount at the end of a category's row. */
export const available = (page: Page, name: string) =>
  categoryRow(page, name).getByRole("cell").last();

/** What a group's categories hold together, at the end of its heading row. */
export const groupTotal = (page: Page, name: string) =>
  groupHeading(page, name).locator("xpath=..").getByRole("cell").last();

/** The line under the month, e.g. "€0 spent of €1,195 assigned". */
export const spentLine = (page: Page) => page.getByText(/ spent of /).filter({ visible: true });

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
  await page.getByRole("textbox", { name: "Balance today" }).fill(balanceToday);
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
