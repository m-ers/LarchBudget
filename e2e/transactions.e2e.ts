import path from "node:path";
import type { Page } from "@playwright/test";
import {
  addAccount,
  addCategories,
  addGroup,
  categoryRow,
  category,
  headerFigure,
} from "./budget-page";
import { expect, test } from "./fixtures";

/** One account, a few categories, and six imported transactions to sort. */
test.beforeEach(async ({ page }) => {
  await addAccount(page, "Checking", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", [
    "Eating out",
    "Emergency fund",
    "Groceries",
    "Coffee",
    "Rent",
    "Utilities",
  ]);

  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(path.join("e2e", "files", "ing.csv"));
  await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported 6 transactions into Checking." }),
  ).toBeVisible();

  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(headerFigure(page)).toHaveText("6");
});

const picker = (page: Page, payee: string, date: string) =>
  page.getByRole("combobox", { name: `Category for ${payee} on ${date}` }).first();

const firstPicker = (page: Page) => page.getByRole("combobox", { name: /^Category for / }).first();

const shown = (select: ReturnType<typeof firstPicker>) => select.locator("option:checked");

test("picking a category saves at once and moves on to the next", async ({ page }) => {
  await picker(page, "Fresh Market", "Nov 18, 2026").selectOption({ label: "Groceries" });
  await expect(headerFigure(page)).toHaveText("5");
  await expect(firstPicker(page)).toBeFocused();
  await expect(page.getByRole("link", { name: /^Transactions.*5 to sort/ })).toBeVisible();

  await picker(page, "Coffee Bar", "Nov 17, 2026").selectOption({ label: "Coffee" });
  await expect(headerFigure(page)).toHaveText("4");
  await picker(page, "Coffee Bar", "Nov 17, 2026").selectOption({ label: "Coffee" });
  await picker(page, "Power & Water Co", "Nov 15, 2026").selectOption({ label: "Utilities" });
  await picker(page, "Landlord", "Nov 2, 2026").selectOption({ label: "Rent" });
  await expect(headerFigure(page)).toHaveText("1");
  await picker(page, "Acme Corp", "Nov 1, 2026").selectOption("ready");

  await expect(
    page.getByText("Everything is sorted. New transactions appear here after your next import."),
  ).toBeVisible();
  await expect(page.getByText("Everything is sorted", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Transactions/ })).not.toContainText("to sort");

  await page.getByRole("link", { name: /^All/ }).click();
  await expect(shown(picker(page, "Fresh Market", "Nov 18, 2026"))).toHaveText("Groceries");
  await expect(shown(picker(page, "Acme Corp", "Nov 1, 2026"))).toHaveText(
    "No category (income or transfer)",
  );
  // The starting balance is dated the day the account was added: today.
  await expect(
    page.getByRole("combobox", { name: /^Category for Starting balance on / }),
  ).toHaveCount(1);

  // The budget now counts the spending: 1,000 + 2,850 in accounts, all of it
  // ready to assign, as the categories are overspent by what was spent.
  // The bank file is from November 2026, so that is the month to look at.
  await page.goto("/?month=2026-11");
  await expect(categoryRow(page, "Groceries").getByRole("cell").nth(3)).toHaveText("45.10");
  await expect(categoryRow(page, "Groceries").getByRole("cell").last()).toContainText("-€45.10");
  await expect(categoryRow(page, "Rent").getByRole("cell").nth(3)).toHaveText("1,100.00");
  await expect(headerFigure(page)).toHaveText("€3,850.00");
});

// Browsing by typing the first letters, which changes the choice the same way
// on every system (on macOS, ArrowDown opens the list instead).
test("browsing the choices with the keyboard does not save; Enter or leaving does", async ({
  page,
}) => {
  const first = firstPicker(page);
  await first.focus();
  await page.keyboard.type("R");
  await expect(shown(first)).toHaveText("Rent");
  await page.keyboard.press("Escape");
  await expect(shown(first)).toHaveText("Choose a category…");
  await expect(headerFigure(page)).toHaveText("6");

  // Letters typed within a second count as one search, so wait in between.
  await page.waitForTimeout(1500);
  await first.focus();
  await page.keyboard.type("E");
  await expect(shown(first)).toHaveText("Eating out");
  await page.waitForTimeout(1500);
  await page.keyboard.type("Em");
  await expect(shown(first)).toHaveText("Emergency fund");
  await page.waitForTimeout(500);
  await expect(headerFigure(page)).toHaveText("6");

  await page.keyboard.press("Enter");
  await expect(headerFigure(page)).toHaveText("5");
  await expect(firstPicker(page)).toBeFocused();

  await page.keyboard.type("G");
  await expect(shown(firstPicker(page))).toHaveText("Groceries");
  await page.keyboard.press("Tab");
  await expect(headerFigure(page)).toHaveText("4");
});

test("a transaction keeps showing its category after the category is archived", async ({
  page,
}) => {
  await picker(page, "Fresh Market", "Nov 18, 2026").selectOption({ label: "Groceries" });
  await expect(headerFigure(page)).toHaveText("5");

  await page.getByRole("link", { name: "Budget" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await categoryRow(page, "Groceries").hover();
  await page.getByRole("button", { name: "Archive Groceries" }).click();
  await expect(category(page, "Groceries")).toHaveCount(0);

  await page.getByRole("link", { name: /^Transactions/ }).click();
  await page.getByRole("link", { name: /^All/ }).click();
  await expect(page).toHaveURL(/show=all/);
  await expect(shown(picker(page, "Fresh Market", "Nov 18, 2026"))).toHaveText(
    "Groceries (archived)",
  );
});

test("an odd limit in the address does not break the page", async ({ page }) => {
  await page.goto("/transactions?limit=200.5");
  await expect(page.getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
  await expect(headerFigure(page)).toHaveText("6");
});
