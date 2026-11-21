import type { Page } from "@playwright/test";
import {
  addIncomeCategories,
  assign,
  breakdownLine,
  categoryRow,
  expectBreakdownAddsUp,
  groupRow,
  monthFromNow,
  openMenu,
  openReadyBreakdown,
  overviewFigure,
  overviewTip,
  readyBreakdown,
  readyButton,
} from "./helpers";
import { expect, test } from "./fixtures";

// The figures under the month: what came in, what was assigned and what was
// spent, and how Ready to assign adds up, on the demo data. Its salary of
// €2,850.00 comes in on the 1st of every month, and €2,295.00 is assigned in
// each month.

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

/** What Received says on hover when no income category counts for the next month. */
const RECEIVED_TIP = "What came in through your income categories for this month.";

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
  await expect(overviewTip(page, "Received")).toHaveAttribute("title", RECEIVED_TIP);

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
  const [lastMonth, thisMonth, nextMonth] = [-1, 0, 1].map((offset) => monthFromNow(offset));
  const received = overviewTip(page, "Received");
  await receiveGift(page);
  await expect(overviewFigure(page, "Received")).toHaveText("€2,900");
  await expect(received).toHaveAttribute("title", RECEIVED_TIP);
  await openReadyBreakdown(page);
  await expect(breakdownLine(page, `Received for ${thisMonth}`)).toHaveText("+ €2,900.00");
  await expect(breakdownLine(page, `Already in for ${nextMonth}`)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // On: Salary's money for this month came in during the month before, and
  // Received includes it. Its tooltip says so.
  await switchSalary(page);
  await expect(received).toHaveAttribute(
    "title",
    `${RECEIVED_TIP} €2,850 of it came in during ${lastMonth} and counts for ${thisMonth}.`,
  );
  await expect(overviewFigure(page, "Received")).toHaveText("€2,900");
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
  await expect(received).toHaveAttribute("title", RECEIVED_TIP);
  await expect(overviewFigure(page, "Received")).toHaveText("€2,900");
  await openReadyBreakdown(page);
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

  test("the figures and the days left are in Dutch", async ({ page }) => {
    await page.goto("/");
    await expect(overviewFigure(page, "Ontvangen")).toHaveText("€2,850");
    await expect(overviewFigure(page, "Toegewezen")).toHaveText("€2,295");
    await expect(overviewFigure(page, "Uitgegeven")).toHaveText(/^€[\d,]+$/);
    await expect(page.getByText(/^nog \d+ dagen?$/).filter({ visible: true })).toBeVisible();

    await categoryRow(page, "Salary").hover();
    await page.getByRole("button", { name: "Acties voor Salary", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Telt voor de volgende maand" }).click();
    const [lastMonth, thisMonth, nextMonth] = [-1, 0, 1].map((offset) =>
      monthFromNow(offset, "nl-NL"),
    );
    await expect(overviewTip(page, "Ontvangen")).toHaveAttribute(
      "title",
      "Wat er via je inkomstencategorieën voor deze maand binnenkwam. " +
        `€2,850 hiervan kwam in ${lastMonth} binnen en telt voor ${thisMonth}.`,
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
