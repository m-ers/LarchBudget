import type { Locator, Page } from "@playwright/test";
import {
  addAccount,
  addCategories,
  addGroup,
  alert,
  assignAndSave,
  assignedField,
  available,
  headerFigure,
  menuButton,
  menuItem,
  openMenu,
  slowConnection,
} from "./helpers";
import { expect, test } from "./fixtures";

// Moving money between categories, and covering an overspent one.

/** Picks a category in the picker by its name; the options also show what each holds. */
async function choose(picker: Locator, name: string) {
  const value = await picker
    .locator("option", { hasText: new RegExp(`^${name} \\(`) })
    .getAttribute("value");
  await picker.selectOption(value!);
}

const form = (page: Page) => page.getByRole("form");

/** The month `offset` months from now, as the budget's address writes it: "2026-11". */
function month(offset: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Imports €70.00 spent at Fresh Market on the first of this month, and sorts it into Groceries. */
async function spendOnGroceries(page: Page) {
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles({
    name: "groceries.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Date,Name,Description,Amount\n${month(0)}-01,Fresh Market,Card payment,-70.00`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 transaction into Main account" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported 1 transaction into Main account." }),
  ).toBeVisible();

  await page.goto("/transactions?show=all");
  const picker = page.getByRole("combobox", { name: /^Category for Fresh Market on / });
  const saved = page.waitForResponse((response) => response.request().method() === "POST");
  await picker.focus();
  await picker.selectOption({ label: "Groceries" });
  await saved;
}

test.beforeEach(async ({ page }) => {
  await addAccount(page, "Main account", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries", "Repairs"]);
  await addGroup(page, "Goals");
  await addCategories(page, "Goals", ["Holiday"]);
  await assignAndSave(page, "Groceries", "300");
  await assignAndSave(page, "Holiday", "100");
  await expect(headerFigure(page)).toHaveText("€600.00");
});

test("money moves from one category to another, and Ready to assign stays", async ({ page }) => {
  await openMenu(page, "Groceries");
  await menuItem(page, "Move money…").click();
  const amount = page.getByRole("textbox", { name: "Amount to move" });
  await expect(amount).toBeFocused();
  await amount.fill("50");
  const picker = page.getByRole("combobox", { name: "Move to" });
  // Ready to assign comes first, then the other categories by group.
  await expect(picker.locator("option").first()).toHaveText("Ready to assign (€600.00)");
  await expect(picker.locator("optgroup").first()).toHaveAttribute("label", "Everyday");
  await expect(picker.locator("option")).toHaveText([
    "Ready to assign (€600.00)",
    "Repairs (€0.00)",
    "Holiday (€100.00)",
  ]);
  await choose(picker, "Holiday");
  await page.getByRole("button", { name: "Move", exact: true }).click();

  await expect(form(page)).toHaveCount(0);
  await expect(assignedField(page, "Groceries")).toHaveValue("250.00");
  await expect(assignedField(page, "Holiday")).toHaveValue("150.00");
  await expect(headerFigure(page)).toHaveText("€600.00");

  await page.reload();
  await expect(available(page, "Holiday")).toHaveText("€150.00");
});

test("moving starts from what the category holds, selected so typing replaces it", async ({
  page,
}) => {
  await openMenu(page, "Groceries");
  await menuItem(page, "Move money…").click();
  const amount = page.getByRole("textbox", { name: "Amount to move" });
  await expect(amount).toHaveValue("300.00");
  await expect(amount).toBeFocused();
  expect(await amount.evaluate((field: HTMLInputElement) => field.selectionEnd)).toBe(6);
  expect(await amount.evaluate((field: HTMLInputElement) => field.selectionStart)).toBe(0);
  await page.keyboard.press("Escape");

  // A category that holds nothing starts empty.
  await openMenu(page, "Repairs");
  await menuItem(page, "Move money…").click();
  await expect(page.getByRole("textbox", { name: "Amount to move" })).toHaveValue("");
});

test("in an earlier month, moving starts from what the category still holds", async ({ page }) => {
  // Groceries: €100 assigned last month, nothing this month, and €70 spent
  // this month. Last month ended with €100, but only €30 of it is left.
  await assignAndSave(page, "Groceries", "");
  await page.goto(`/?month=${month(-1)}`);
  await assignAndSave(page, "Groceries", "100");
  await spendOnGroceries(page);

  await page.goto(`/?month=${month(-1)}`);
  await expect(available(page, "Groceries")).toHaveText("€100.00");
  await openMenu(page, "Groceries");
  await menuItem(page, "Move money…").click();
  const amount = form(page).getByRole("textbox", { name: "Amount to move" });
  await expect(amount).toHaveValue("30.00");
  // As much as the form says the category holds.
  await expect(form(page).getByText(/leaves it overspent/)).toHaveCount(0);
  await amount.fill("30.01");
  await expect(
    form(page).getByText("Groceries holds €30.00; moving more leaves it overspent."),
  ).toBeVisible();
});

test("money moves back to Ready to assign", async ({ page }) => {
  await openMenu(page, "Holiday");
  await menuItem(page, "Move money…").click();
  await page.keyboard.type("100");
  await page.keyboard.press("Enter");
  await expect(form(page)).toHaveCount(0);
  await expect(assignedField(page, "Holiday")).toHaveValue("");
  await expect(headerFigure(page)).toHaveText("€700.00");
});

test("an overspent category is covered from another, with the amount filled in", async ({
  page,
}) => {
  await assignAndSave(page, "Repairs", "-80");
  // Only an overspent category offers it.
  await openMenu(page, "Groceries");
  await expect(menuItem(page, "Cover overspending…")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await openMenu(page, "Repairs");
  await menuItem(page, "Cover overspending…").click();
  await expect(page.getByRole("textbox", { name: "Amount to cover" })).toHaveValue("80.00");
  const picker = page.getByRole("combobox", { name: "Cover from" });
  await expect(picker).toHaveValue("ready");
  await choose(picker, "Groceries");
  await page.getByRole("button", { name: "Cover", exact: true }).click();

  await expect(form(page)).toHaveCount(0);
  await expect(available(page, "Repairs")).toHaveText("€0.00");
  await expect(assignedField(page, "Groceries")).toHaveValue("220.00");
  await expect(headerFigure(page)).toHaveText("€680.00");
});

test("Escape or Cancel closes the form, and only an amount above zero is moved", async ({
  page,
}) => {
  // From the keyboard, Escape goes back to the row's menu button.
  await menuButton(page, "Groceries").focus();
  await page.keyboard.press("Enter");
  await menuItem(page, "Move money…").press("Enter");
  await expect(page.getByRole("textbox", { name: "Amount to move" })).toBeFocused();
  await page.keyboard.type("0");
  await page.keyboard.press("Enter");
  await expect(alert(page, "Enter an amount above zero.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(form(page)).toHaveCount(0);
  await expect(menuButton(page, "Groceries")).toBeFocused();

  await openMenu(page, "Groceries");
  await menuItem(page, "Move money…").click();
  await page.keyboard.type("abc");
  await page.keyboard.press("Enter");
  await expect(alert(page, "That is not an amount.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(assignedField(page, "Groceries")).toHaveValue("300.00");
  await expect(headerFigure(page)).toHaveText("€600.00");
});

test("on a slow connection, the move shows before the server answers", async ({ page }) => {
  await openMenu(page, "Groceries");
  await menuItem(page, "Move money…").click();
  await page.keyboard.type("120");
  await choose(page.getByRole("combobox", { name: "Move to" }), "Holiday");
  await slowConnection(page, 2_000);
  await page.getByRole("button", { name: "Move", exact: true }).click();

  const atOnce = { timeout: 1_000 };
  await expect(assignedField(page, "Groceries")).toHaveValue("180.00", atOnce);
  await expect(available(page, "Holiday")).toHaveText("€220.00", atOnce);
  await expect(headerFigure(page)).toHaveText("€600.00");
  // The form closes once the move is saved.
  await expect(form(page)).toHaveCount(0);
  await expect(assignedField(page, "Holiday")).toHaveValue("220.00");
});

test("says so when more is moved than the category holds", async ({ page }) => {
  await openMenu(page, "Holiday");
  await menuItem(page, "Move money…").click();
  const amount = form(page).getByRole("textbox", { name: "Amount to move" });

  await amount.fill("100");
  await expect(form(page).getByText(/leaves it overspent/)).toHaveCount(0);
  await amount.fill("250");
  await expect(
    form(page).getByText("Holiday holds €100.00; moving more leaves it overspent."),
  ).toBeVisible();

  // It is a warning, not a refusal.
  await form(page).getByRole("button", { name: "Move", exact: true }).click();
  await expect(available(page, "Holiday")).toContainText("-€150.00");
});

test("a move that is being saved cannot be cancelled halfway", async ({ page }) => {
  await openMenu(page, "Groceries");
  await menuItem(page, "Move money…").click();
  await form(page).getByRole("textbox", { name: "Amount to move" }).fill("50");
  await choose(form(page).getByRole("combobox", { name: "Move to" }), "Holiday");
  await slowConnection(page, 800);

  await form(page).getByRole("button", { name: "Move", exact: true }).click();
  await expect(form(page).getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(form(page)).toBeVisible();

  // It closes by itself once the move is saved.
  await expect(form(page)).toHaveCount(0);
  await expect(assignedField(page, "Groceries")).toHaveValue("250.00");
  await expect(assignedField(page, "Holiday")).toHaveValue("150.00");
});
