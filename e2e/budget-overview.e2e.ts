import type { Page } from "@playwright/test";
import {
  addIncomeCategories,
  assign,
  categoryRow,
  fromLastMonthLine,
  groupRow,
  openMenu,
  overviewFigure,
} from "./helpers";
import { expect, test } from "./fixtures";

// The figures under the month: what came in, what was assigned and what was
// spent, on the demo data. Its salary of €2,850.00 comes in on the 1st of
// every month, and €2,295.00 is assigned in each month.

test.use({ app: { seed: true } });

const GROUPS = ["Fixed costs", "Everyday", "Goals"];

/** Amounts as the figures write them: whole euros, as LOCALE en-US does. */
const euros = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

/** What the groups' headings say was spent, added up, in cents. */
async function spentInGroups(page: Page): Promise<number> {
  let cents = 0;
  for (const group of GROUPS) {
    // The Spent column: "–" for nothing, "+12.00" for a refund.
    const text = await groupRow(page, group).getByRole("cell").nth(1).innerText();
    if (text === "–") continue;
    const amount = Math.round(Number(text.replace(/[+,]/g, "")) * 100);
    cents += text.startsWith("+") ? -amount : amount;
  }
  return cents;
}

/** The name of the month before this one, e.g. "October" or "oktober". */
function lastMonthName(locale: string): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return date.toLocaleString(locale, { month: "long" });
}

/** Today, as a bank file writes it: 2026-11-21. */
function today(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Imports €50.00 from Aunt Mary today and sorts it into the income category Gifts. */
async function receiveGift(page: Page) {
  await page.goto("/");
  await addIncomeCategories(page, ["Gifts"]);
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles({
    name: "gift.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Date,Name,Description,Amount\n${today()},Aunt Mary,Birthday,50.00`),
  });
  await page.getByRole("button", { name: /^Import 1 transaction into / }).click();
  await expect(page.getByRole("heading", { name: /^Imported 1 transaction into / })).toBeVisible();

  await page.goto("/transactions?show=all");
  const picker = page.getByRole("combobox", { name: /^Category for Aunt Mary on / });
  const saved = page.waitForResponse((response) => response.request().method() === "POST");
  await picker.focus();
  await picker.selectOption({ label: "Gifts" });
  await saved;
  await page.goto("/");
}

/** Switches "Counts for the next month" for Salary from its menu. */
async function switchSalary(page: Page) {
  await openMenu(page, "Salary");
  await page.getByRole("menuitemcheckbox", { name: "Counts for the next month" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test("the figures show what came in, was assigned and was spent this month", async ({ page }) => {
  await page.goto("/");
  await expect(overviewFigure(page, "Received")).toHaveText("€2,850");
  await expect(overviewFigure(page, "Assigned")).toHaveText("€2,295");
  // What the groups spent together.
  await expect(groupRow(page, "Fixed costs")).toBeVisible();
  await expect(overviewFigure(page, "Spent")).toHaveText(euros(await spentInGroups(page)));
  // Each explains itself on hover.
  await expect(overviewFigure(page, "Assigned").locator("xpath=..")).toHaveAttribute(
    "title",
    "What you put into your categories this month.",
  );
  // No income category counts for the next month, so nothing says so.
  await expect(fromLastMonthLine(page)).toHaveCount(0);

  // A new amount shows at once.
  await assign(page, "Groceries", "480");
  await expect(overviewFigure(page, "Assigned")).toHaveText("€2,395");
});

test("the days left show beside this month only", async ({ page }) => {
  await page.goto("/");
  const daysLeft = page.getByText(/^\d+ days? to go$/).filter({ visible: true });
  await expect(daysLeft).toBeVisible();

  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page.getByRole("link", { name: "This month" })).toBeVisible();
  await expect(daysLeft).toHaveCount(0);
  // The figures stay, for that month.
  await expect(overviewFigure(page, "Received")).toHaveText("€2,850");
  await expect(overviewFigure(page, "Assigned")).toHaveText("€2,295");
});

test("with Salary counting for the next month, Received says what came in the month before", async ({
  page,
}) => {
  await receiveGift(page);
  await expect(overviewFigure(page, "Received")).toHaveText("€2,900");
  await expect(fromLastMonthLine(page)).toHaveCount(0);

  // On: Salary's money for this month came in during the month before, and
  // Received includes it.
  await switchSalary(page);
  await expect(fromLastMonthLine(page)).toHaveText(`€2,850 from ${lastMonthName("en-US")}`);
  await expect(overviewFigure(page, "Received")).toHaveText("€2,900");
  await expect(categoryRow(page, "Salary").getByRole("cell").last()).toHaveText("€2,850.00");
  await expect(fromLastMonthLine(page)).toHaveAttribute(
    "title",
    "From income categories that count for the next month.",
  );

  // Off again.
  await switchSalary(page);
  await expect(fromLastMonthLine(page)).toHaveCount(0);
  await expect(overviewFigure(page, "Received")).toHaveText("€2,900");
});

test.describe("in Dutch", () => {
  test.use({ locale: "nl-NL" });

  test("the figures and the days left are in Dutch", async ({ page }) => {
    await page.goto("/");
    await expect(overviewFigure(page, "Ontvangen")).toHaveText("€2,850");
    await expect(overviewFigure(page, "Toegewezen")).toHaveText("€2,295");
    await expect(overviewFigure(page, "Uitgegeven")).toHaveText(/^€[\d,]+$/);
    await expect(page.getByText(/^nog \d+ dagen?$/).filter({ visible: true })).toBeVisible();

    await categoryRow(page, "Salary").hover();
    await page.getByRole("button", { name: "Acties voor Salary", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Telt voor de volgende maand" }).click();
    await expect(fromLastMonthLine(page, "Ontvangen")).toHaveText(
      `waarvan €2,850 uit ${lastMonthName("nl-NL")}`,
    );
  });
});
