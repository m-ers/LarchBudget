import type { Page } from "@playwright/test";
import {
  addIncomeCategories,
  assign,
  breakdownLine,
  categoryRow,
  expectBreakdownAddsUp,
  groupTotal,
  monthFromNow,
  openMenu,
  openReadyBreakdown,
  readyBreakdown,
  readyButton,
} from "./helpers";
import { expect, test } from "./fixtures";

// The budget's header: the month with the days left, and Ready to assign,
// which opens how it adds up, on the demo data. Its salary of €2,850.00
// comes in on the 1st of every month, and €2,295.00 is assigned in each
// month.

test.use({ app: { seed: true } });

/** A month counted from this one, with its year, as the Salary row writes it: "October 2026". */
function monthAndYear(offset: number, locale = "en-US"): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return date.toLocaleString(locale, { month: "long", year: "numeric" });
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

test("the Income total and the card show what came in and was assigned this month", async ({
  page,
}) => {
  const thisMonth = monthFromNow(0);
  await page.goto("/");
  await expect(groupTotal(page, "Income")).toHaveText("€2,850.00 received");
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Received for ${thisMonth}`)).toHaveText("+ €2,850.00");
  await expect(breakdownLine(page, `Assigned in ${thisMonth}`)).toHaveText("− €2,295.00");
  await expectBreakdownAddsUp(page);
  await page.keyboard.press("Escape");

  // A new amount shows at once.
  await assign(page, "Groceries", "480");
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Assigned in ${thisMonth}`)).toHaveText("− €2,395.00");
  await expectBreakdownAddsUp(page);
});

test("the days left show beside this month only", async ({ page }) => {
  await page.goto("/");
  const daysLeft = page.getByText(/^\d+ days? to go$/).filter({ visible: true });
  await expect(daysLeft).toBeVisible();

  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page.getByRole("link", { name: "This month" })).toBeVisible();
  await expect(daysLeft).toHaveCount(0);
  // The card shows that month.
  const lastMonth = monthFromNow(-1);
  await expect(groupTotal(page, "Income")).toHaveText("€2,850.00 received");
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Received for ${lastMonth}`)).toHaveText("+ €2,850.00");
  await expect(breakdownLine(page, `Assigned in ${lastMonth}`)).toHaveText("− €2,295.00");
  await expectBreakdownAddsUp(page);
});

test("with Salary counting for the next month, Received includes what came in the month before", async ({
  page,
}) => {
  const [thisMonth, nextMonth] = [0, 1].map((offset) => monthFromNow(offset));
  const nextMonthHint = categoryRow(page, "Salary").getByTitle(/^Counts for the next month/);
  await receiveGift(page);
  await expect(groupTotal(page, "Income")).toHaveText("€2,900.00 received");
  await expect(nextMonthHint).toHaveCount(0);
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Received for ${thisMonth}`)).toHaveText("+ €2,900.00");
  await expect(breakdownLine(page, `Already in for ${nextMonth}`)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // On: Salary's money for this month came in during the month before, and
  // Received includes it. Salary's row says so.
  await switchSalary(page);
  await expect(nextMonthHint).toHaveAttribute(
    "title",
    `Counts for the next month: this is what came in during ${monthAndYear(-1)}.`,
  );
  await expect(groupTotal(page, "Income")).toHaveText("€2,900.00 received");
  await expect(categoryRow(page, "Salary").getByRole("cell").last()).toHaveText("€2,850.00");
  // How Ready to assign adds up counts it for this month too, and the salary
  // that came in this month for the next.
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Received for ${thisMonth}`)).toHaveText("+ €2,900.00");
  await expect(breakdownLine(page, `Already in for ${nextMonth}`)).toHaveText("+ €2,850.00");
  await expectBreakdownAddsUp(page);
  await page.keyboard.press("Escape");

  // Off again.
  await switchSalary(page);
  await expect(nextMonthHint).toHaveCount(0);
  await expect(groupTotal(page, "Income")).toHaveText("€2,900.00 received");
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Received for ${thisMonth}`)).toHaveText("+ €2,900.00");
  await expect(breakdownLine(page, `Already in for ${nextMonth}`)).toHaveCount(0);
  await expectBreakdownAddsUp(page);
});

test("how Ready to assign adds up opens from the keyboard, and closes as a popup does", async ({
  page,
}) => {
  await page.goto("/");
  const button = readyButton(page);
  const card = readyBreakdown(page);
  await expect(button).toHaveAccessibleName(
    /^Ready to assign: €[\d,]+\.\d\d, show how it adds up$/,
  );
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // Enter opens it, and the card takes the focus.
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(card).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(button).toHaveAttribute("aria-controls", (await card.getAttribute("id"))!);
  await expect(breakdownLine(page, `Assigned in ${monthFromNow(0)}`)).toHaveText("− €2,295.00");
  await expectBreakdownAddsUp(page);

  // Escape closes it, and the focus goes back to the figure.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // Tab moves on past it, and closes it.
  await page.keyboard.press("Space");
  await expect(card).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(card).toHaveCount(0);
  await expect(button).not.toBeFocused();

  // A click on the figure opens and closes it; so does a click elsewhere.
  await button.click();
  await expect(card).toBeVisible();
  await button.click();
  await expect(card).toHaveCount(0);
  await button.click();
  await expect(card).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(card).toHaveCount(0);
});

test.describe("in Dutch", () => {
  test.use({ locale: "nl-NL" });

  test("the days left, the Income total and the card are in Dutch", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^nog \d+ dagen?$/).filter({ visible: true })).toBeVisible();
    await expect(groupTotal(page, "Inkomsten")).toHaveText("€2,850.00 ontvangen");

    await categoryRow(page, "Salary").hover();
    await page.getByRole("button", { name: "Acties voor Salary", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Telt voor de volgende maand" }).click();
    const [lastMonth, thisMonth, nextMonth] = [-1, 0, 1].map((offset) =>
      monthFromNow(offset, "nl-NL"),
    );
    await expect(
      categoryRow(page, "Salary").getByTitle(/^Telt voor de volgende maand/),
    ).toHaveAttribute(
      "title",
      `Telt voor de volgende maand: dit is wat er in ${monthAndYear(-1, "nl-NL")} binnenkwam.`,
    );

    // How Ready to assign adds up, in Dutch.
    await readyButton(page, "laat zien hoe het is opgebouwd").click();
    const card = readyBreakdown(page, "Hoe Nog toe te wijzen is opgebouwd");
    await expect(card).toBeFocused();
    await expect(breakdownLine(page, `Over uit ${lastMonth}`, card)).toBeVisible();
    await expect(breakdownLine(page, `Ontvangen voor ${thisMonth}`, card)).toHaveText(
      "+ €2,850.00",
    );
    await expect(breakdownLine(page, `Toegewezen in ${thisMonth}`, card)).toHaveText("− €2,295.00");
    await expect(breakdownLine(page, `Al binnen voor ${nextMonth}`, card)).toHaveText(
      "+ €2,850.00",
    );
    await expect(card.locator("dt").last()).toHaveText("Nog toe te wijzen");
    await expectBreakdownAddsUp(page, card);
  });
});
