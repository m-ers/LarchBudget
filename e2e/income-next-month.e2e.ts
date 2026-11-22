import type { Page } from "@playwright/test";
import {
  addAccount,
  addIncomeCategories,
  available,
  breakdownLine,
  category,
  categoryRow,
  expectBreakdownAddsUp,
  groupTotal,
  headerFigure,
  menuButton,
  openMenu,
  openReadyBreakdown,
} from "./helpers";
import { expect, test } from "./fixtures";

// An income category whose money counts for the month after it came in,
// such as a salary paid near the end of the month.

/** The menu item that switches it, in the open menu. */
const nextMonthItem = (page: Page) =>
  page.getByRole("menuitemcheckbox", { name: "Counts for the next month", exact: true });

/**
 * Checks how Ready to assign adds up for October or November 2026: what it
 * counts as received for the month, and what is already in for the month
 * after it (none when not given). It opens the card and closes it again.
 */
async function expectCard(
  page: Page,
  month: "October" | "November",
  received: string,
  alreadyIn?: string,
) {
  const after = month === "October" ? "November" : "December";
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Received for ${month}`)).toHaveText(received);
  const later = breakdownLine(page, `Already in for ${after}`);
  if (alreadyIn) await expect(later).toHaveText(alreadyIn);
  else await expect(later).toHaveCount(0);
  await expectBreakdownAddsUp(page);
  await page.keyboard.press("Escape");
}

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

test("what comes in during October counts for November, and Ready to assign stays the same", async ({
  page,
}) => {
  // Off: each month shows what arrived in it.
  await openMonth(page, "2026-10");
  const ready = await headerFigure(page).innerText();
  await expect(available(page, "Salary")).toHaveText("€3,000.00");
  await expect(available(page, "Gifts")).toHaveText("€50.00");
  await expect(groupTotal(page, "Income")).toHaveText("€3,050.00 received");
  await expectCard(page, "October", "+ €3,050.00");
  await openMonth(page, "2026-11");
  await expect(available(page, "Salary")).toHaveText("€0.00");
  await expect(groupTotal(page, "Income")).toHaveText("€0.00 received");
  await expectCard(page, "November", "+ €0.00");
  await expect(headerFigure(page)).toHaveText(ready);

  // On: everything Salary received in October, on the 5th and the 25th,
  // counts for November. Gifts keeps counting for October.
  await switchSalary(page);
  await expect(available(page, "Salary")).toHaveText("€3,000.00");
  await expect(available(page, "Gifts")).toHaveText("€0.00");
  await expect(groupTotal(page, "Income")).toHaveText("€3,000.00 received");
  // How Ready to assign adds up counts all of it as received for November.
  await expectCard(page, "November", "+ €3,000.00");
  await expect(headerFigure(page)).toHaveText(ready);
  // An arrow after the name says why, and the amount leads to October.
  await expect(
    categoryRow(page, "Salary").getByTitle(/^Counts for the next month/),
  ).toHaveAttribute(
    "title",
    "Counts for the next month: this is what came in during October 2026.",
  );
  await expect(categoryRow(page, "Gifts").getByTitle(/^Counts for the next month/)).toHaveCount(0);
  await expect(
    categoryRow(page, "Salary").getByRole("link", { name: "€3,000.00" }),
  ).toHaveAttribute("href", /^\/transactions\?show=all&category=\d+&month=2026-10$/);

  // October now shows what Salary received in September: nothing.
  await openMonth(page, "2026-10");
  await expect(available(page, "Salary")).toHaveText("€0.00");
  await expect(available(page, "Gifts")).toHaveText("€50.00");
  await expect(groupTotal(page, "Income")).toHaveText("€50.00 received");
  // There, Salary's money is already in for November.
  await expectCard(page, "October", "+ €50.00", "+ €3,000.00");
  await expect(headerFigure(page)).toHaveText(ready);

  // Off again: everything back where it arrived.
  await switchSalary(page);
  await expect(available(page, "Salary")).toHaveText("€3,000.00");
  await expect(groupTotal(page, "Income")).toHaveText("€3,050.00 received");
  await expectCard(page, "October", "+ €3,050.00");
  await expect(categoryRow(page, "Salary").getByRole("link")).toHaveAttribute(
    "href",
    /^\/transactions\?show=all&category=\d+&month=2026-10$/,
  );
  await openMonth(page, "2026-11");
  await expect(available(page, "Salary")).toHaveText("€0.00");
  await expectCard(page, "November", "+ €0.00");
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
  await expect(available(page, "Salary")).toHaveText("€3,000.00");

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
