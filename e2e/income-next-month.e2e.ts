import type { Page } from "@playwright/test";
import {
  addAccount,
  addIncomeCategories,
  available,
  category,
  categoryRow,
  groupTotal,
  headerFigure,
  menuButton,
  openMenu,
} from "./helpers";
import { expect, test } from "./fixtures";

// An income category whose money from the 15th on counts for the next month,
// such as a salary paid near the end of the month.

/** The menu item that switches it, in the open menu. */
const nextMonthItem = (page: Page) =>
  page.getByRole("menuitemcheckbox", { name: "Counts for the next month", exact: true });

/** The line under the month, e.g. "€2,850 received · 9 days to go". */
const monthLine = (page: Page) =>
  page.getByRole("heading", { level: 1 }).locator("xpath=../following-sibling::p");

/** What the line under the month says, with "· 9 days to go" when it is this month. */
const says = (text: string) =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( · \\d+ days? to go)?$`);

/** Opens a month, waiting until it is on screen. */
async function openMonth(page: Page, month: string) {
  await page.goto(`/?month=${month}`);
  await expect(category(page, "Salary")).toBeVisible();
}

/** Switches the setting from Salary's menu with the mouse. */
async function switchSalary(page: Page) {
  await openMenu(page, "Salary");
  await nextMonthItem(page).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/**
 * Imports a bank file with fixed dates and sorts it: from Acme Corp €150.00
 * on 5 October 2026 and the salary of €2,850.00 on 25 October 2026, both
 * into Salary, and €50.00 from Aunt Mary on 25 October 2026 into Gifts.
 */
async function importIncome(page: Page) {
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles({
    name: "income.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Date,Name,Description,Amount",
        "2026-10-05,Acme Corp,Holiday allowance,150.00",
        "2026-10-25,Acme Corp,Salary November,2850.00",
        "2026-10-25,Aunt Mary,Birthday,50.00",
      ].join("\n"),
    ),
  });
  await page.getByRole("button", { name: "Import 3 transactions into Checking" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported 3 transactions into Checking." }),
  ).toBeVisible();

  for (const [what, name] of [
    ["Acme Corp on Oct 5, 2026", "Salary"],
    ["Acme Corp on Oct 25, 2026", "Salary"],
    ["Aunt Mary on Oct 25, 2026", "Gifts"],
  ]) {
    await page.goto("/transactions?show=all");
    const picker = page.getByRole("combobox", { name: new RegExp(`^Category for ${what},`) });
    const saved = page.waitForResponse((response) => response.request().method() === "POST");
    await picker.focus();
    await picker.selectOption({ label: name });
    await saved;
  }
}

test.beforeEach(async ({ page }) => {
  await addAccount(page, "Checking", "1000");
  await page.goto("/");
  await addIncomeCategories(page, ["Salary", "Gifts"]);
  await importIncome(page);
});

test("a salary from the 25th counts for the next month, and Ready to assign stays the same", async ({
  page,
}) => {
  // Off: each month shows what arrived in it.
  await openMonth(page, "2026-10");
  const ready = await headerFigure(page).innerText();
  await expect(available(page, "Salary")).toHaveText("€3,000.00");
  await expect(available(page, "Gifts")).toHaveText("€50.00");
  await expect(groupTotal(page, "Income")).toHaveText("€3,050.00 received");
  await expect(monthLine(page)).toHaveText(says("€3,050 received"));
  await openMonth(page, "2026-11");
  await expect(available(page, "Salary")).toHaveText("€0.00");
  await expect(groupTotal(page, "Income")).toHaveText("€0.00 received");
  await expect(monthLine(page)).toHaveCount(0);
  await expect(headerFigure(page)).toHaveText(ready);

  // On: the salary of the 25th moves to November.
  await switchSalary(page);
  await expect(available(page, "Salary")).toHaveText("€2,850.00");
  await expect(available(page, "Gifts")).toHaveText("€0.00");
  await expect(groupTotal(page, "Income")).toHaveText("€2,850.00 received");
  await expect(monthLine(page)).toHaveText(says("€2,850 received"));
  await expect(headerFigure(page)).toHaveText(ready);
  // Pointing at the amount says which days it covers. They span two months,
  // so it leads to all of Salary's transactions.
  const amount = categoryRow(page, "Salary").getByRole("link", { name: "€2,850.00" });
  await expect(amount).toHaveAttribute("title", "Received from October 15 to November 14");
  await expect(amount).toHaveAttribute("href", /^\/transactions\?show=all&category=\d+$/);

  // What came in on the 5th stays in October, and so does Gifts.
  await openMonth(page, "2026-10");
  await expect(available(page, "Salary")).toHaveText("€150.00");
  await expect(categoryRow(page, "Salary").getByRole("link")).toHaveAttribute(
    "title",
    "Received from September 15 to October 14",
  );
  await expect(available(page, "Gifts")).toHaveText("€50.00");
  await expect(groupTotal(page, "Income")).toHaveText("€200.00 received");
  await expect(monthLine(page)).toHaveText(says("€200 received"));
  await expect(headerFigure(page)).toHaveText(ready);

  // Off again: everything back where it arrived.
  await switchSalary(page);
  await expect(available(page, "Salary")).toHaveText("€3,000.00");
  await expect(groupTotal(page, "Income")).toHaveText("€3,050.00 received");
  await expect(monthLine(page)).toHaveText(says("€3,050 received"));
  await expect(categoryRow(page, "Salary").getByRole("link")).toHaveAttribute(
    "href",
    /^\/transactions\?show=all&category=\d+&month=2026-10$/,
  );
  await openMonth(page, "2026-11");
  await expect(available(page, "Salary")).toHaveText("€0.00");
  await expect(monthLine(page)).toHaveCount(0);
  await expect(headerFigure(page)).toHaveText(ready);
});

test("the menu item shows whether it is on, and works from the keyboard", async ({ page }) => {
  await openMonth(page, "2026-11");
  await openMenu(page, "Salary");
  await expect(nextMonthItem(page)).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  // From the name, Tab reaches the menu button; End and the up arrow reach
  // the item just above Archive, and Enter switches it.
  await category(page, "Salary").focus();
  await page.keyboard.press("Tab");
  const button = menuButton(page, "Salary");
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(nextMonthItem(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(available(page, "Salary")).toHaveText("€2,850.00");

  // It stays on after a reload, and only for Salary.
  await page.reload();
  await openMenu(page, "Salary");
  await expect(nextMonthItem(page)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await openMenu(page, "Gifts");
  await expect(nextMonthItem(page)).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  // Space switches it off again.
  await menuButton(page, "Salary").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(nextMonthItem(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(available(page, "Salary")).toHaveText("€0.00");
  await openMenu(page, "Salary");
  await expect(nextMonthItem(page)).toHaveAttribute("aria-checked", "false");
});
