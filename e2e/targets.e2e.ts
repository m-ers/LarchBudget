import type { Page } from "@playwright/test";
import {
  addAccount,
  addCategories,
  addGroup,
  alert,
  assign,
  assignAndSave,
  assignedField,
  available,
  categoryRow,
  headerFigure,
  menuButton,
  menuItem,
  openMenu,
  overviewFigure,
  slowConnection,
} from "./helpers";
import { expect, test } from "./fixtures";

// Targets: what a category should get, what it still needs this month, and
// assigning all of that at once. The dates are real, so months are worked
// out from today.

/** The month `offset` months from now: "2026-11". */
function month(offset: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The month `offset` months from now, written out: "May 2027", or "May" in short. */
function monthLabel(offset: number, form: "long" | "short", locale = "en-US"): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleString(locale, {
    month: form,
    year: "numeric",
  });
}

type Kind = "Every month" | "Top up to" | "By a month";

const targetForm = (page: Page, name: string) =>
  page.getByRole("form", { name: `Target for ${name}` });

/** The quiet line under a category's Assigned amount, such as "€80 to go". */
const toGo = (page: Page, name: string) => categoryRow(page, name).getByText(/ to go$/);

/** Every "to go" in the budget table (the header has days "to go"). */
const anyToGo = (page: Page) => page.getByRole("table").getByText(/ to go$/);

/** The tooltip that explains a category's Available amount. */
const explanation = (page: Page, name: string) => available(page, name).locator("[title]");

const assignTargetsButton = (page: Page) => page.getByRole("button", { name: "Assign targets" });

/** The line above the groups with the Assign targets button. */
const targetsLine = (page: Page) => page.locator("p", { has: assignTargetsButton(page) });

/** Sets or changes a category's target from its menu, and waits until it is saved. */
async function setTarget(page: Page, name: string, kind: Kind, amount: string, by?: number) {
  await openMenu(page, name);
  await page.getByRole("menuitem", { name: /^(Set|Change) target…$/ }).click();
  const form = targetForm(page, name);
  await form.getByRole("combobox", { name: "Kind of target" }).selectOption({ label: kind });
  await form.getByRole("textbox", { name: "Target amount" }).fill(amount);
  if (by !== undefined) {
    await form
      .getByRole("combobox", { name: "Target month" })
      .selectOption({ label: monthLabel(by, "short") });
  }
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
}

test.describe("with an account and categories", () => {
  test.beforeEach(async ({ page }) => {
    await addAccount(page, "Main account", "3000");
    await page.goto("/");
    await addGroup(page, "Bills");
    await addCategories(page, "Bills", ["Rent"]);
    await addGroup(page, "Everyday");
    await addCategories(page, "Everyday", ["Groceries", "Eating out"]);
    await addGroup(page, "Goals");
    await addCategories(page, "Goals", ["Holiday"]);
  });

  test("each kind of target is set from the menu, and says what it still needs", async ({
    page,
  }) => {
    await openMenu(page, "Rent");
    await expect(menuItem(page, "Set target…")).toBeVisible();
    await page.keyboard.press("Escape");

    await setTarget(page, "Rent", "Every month", "1100");
    await expect(toGo(page, "Rent")).toHaveText("€1,100 to go");
    await expect(toGo(page, "Rent")).toHaveAttribute(
      "title",
      "Your target needs €1,100 more this month.",
    );
    await expect(assignedField(page, "Rent")).toHaveAccessibleDescription(
      "Your target needs €1,100 more this month.",
    );

    await setTarget(page, "Groceries", "Top up to", "400");
    await expect(toGo(page, "Groceries")).toHaveText("€400 to go");

    // Six months from now: seven months, this one included, of €171.43 (rounded up).
    await setTarget(page, "Holiday", "By a month", "1200", 6);
    await expect(toGo(page, "Holiday")).toHaveText("€171.43 to go");

    // Without a target, nothing shows.
    await expect(toGo(page, "Eating out")).toHaveCount(0);
    await expect(page.getByText("Your targets need €1,671.43 more this month.")).toBeVisible();

    // The Available tooltip names the target.
    await expect(explanation(page, "Rent")).toHaveAttribute(
      "title",
      "Nothing assigned or spent this month.\nTarget: €1,100 every month.",
    );
    await expect(explanation(page, "Groceries")).toHaveAttribute(
      "title",
      "Nothing assigned or spent this month.\nTarget: top up to €400.",
    );
    await expect(explanation(page, "Holiday")).toHaveAttribute(
      "title",
      `Nothing assigned or spent this month.\nTarget: €1,200 by ${monthLabel(6, "long")}.`,
    );

    // What is typed in Assigned counts at once.
    await assign(page, "Rent", "300");
    await expect(toGo(page, "Rent")).toHaveText("€800 to go");
    await expect(page.getByText("Your targets need €1,371.43 more this month.")).toBeVisible();
    await assignAndSave(page, "Rent", "1100");
    await expect(toGo(page, "Rent")).toHaveCount(0);

    // Stored, and the menu offers to change it.
    await page.reload();
    await expect(toGo(page, "Groceries")).toHaveText("€400 to go");
    await expect(toGo(page, "Holiday")).toHaveText("€171.43 to go");
    await openMenu(page, "Rent");
    await expect(menuItem(page, "Change target…")).toBeVisible();
    await expect(menuItem(page, "Set target…")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Next month needs it again; last month, which is over, needs nothing.
    await page.goto(`/?month=${month(1)}`);
    await expect(toGo(page, "Rent")).toHaveText("€1,100 to go");
    await page.goto(`/?month=${month(-1)}`);
    await expect(assignedField(page, "Rent")).toBeVisible();
    await expect(anyToGo(page)).toHaveCount(0);
    await expect(assignTargetsButton(page)).toHaveCount(0);
    await expect(explanation(page, "Rent")).toHaveAttribute(
      "title",
      /\nTarget: €1,100 every month\.$/,
    );
  });

  test("a target is set and changed from the keyboard; Escape and Cancel close the form", async ({
    page,
  }) => {
    await menuButton(page, "Rent").focus();
    await page.keyboard.press("Enter");
    await menuItem(page, "Set target…").press("Enter");
    const form = targetForm(page, "Rent");
    const amount = form.getByRole("textbox", { name: "Target amount" });
    await expect(amount).toBeFocused();
    // The kind comes first, every month unless chosen otherwise.
    await page.keyboard.press("Shift+Tab");
    await expect(form.getByRole("combobox", { name: "Kind of target" })).toBeFocused();
    await expect(form.getByRole("combobox", { name: "Kind of target" })).toHaveValue("monthly");
    await page.keyboard.press("Tab");
    await page.keyboard.type("1100");
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    await expect(menuButton(page, "Rent")).toBeFocused();
    await expect(toGo(page, "Rent")).toHaveText("€1,100 to go");

    // Changing starts from the amount, selected, so typing replaces it.
    await page.keyboard.press("Enter");
    await menuItem(page, "Change target…").press("Enter");
    await expect(amount).toHaveValue("1100.00");
    await page.keyboard.type("1200");
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    await expect(toGo(page, "Rent")).toHaveText("€1,200 to go");

    // Only an amount above zero.
    await page.keyboard.press("Enter");
    await menuItem(page, "Change target…").press("Enter");
    await page.keyboard.type("0");
    await page.keyboard.press("Enter");
    await expect(alert(page, "Enter an amount above zero.")).toBeVisible();
    await page.keyboard.type("abc");
    await page.keyboard.press("Enter");
    await expect(alert(page, "That is not an amount.")).toBeVisible();
    // Escape closes the form, back to the menu button, and nothing changed.
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    await expect(menuButton(page, "Rent")).toBeFocused();
    await expect(toGo(page, "Rent")).toHaveText("€1,200 to go");

    await openMenu(page, "Rent");
    await menuItem(page, "Change target…").click();
    await amount.fill("50");
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toHaveCount(0);
    await page.reload();
    await expect(toGo(page, "Rent")).toHaveText("€1,200 to go");
  });

  test("a target is changed and removed", async ({ page }) => {
    await setTarget(page, "Rent", "Every month", "1100");

    await openMenu(page, "Rent");
    await menuItem(page, "Change target…").click();
    const form = targetForm(page, "Rent");
    // The form starts from the target as it is.
    await expect(form.getByRole("combobox", { name: "Kind of target" })).toHaveValue("monthly");
    await expect(form.getByRole("textbox", { name: "Target amount" })).toHaveValue("1100.00");
    await expect(form.getByRole("combobox", { name: "Target month" })).toHaveCount(0);
    await form.getByRole("combobox", { name: "Kind of target" }).selectOption("topUp");
    await form.getByRole("textbox", { name: "Target amount" }).fill("1,000");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toHaveCount(0);
    await expect(toGo(page, "Rent")).toHaveText("€1,000 to go");
    await expect(explanation(page, "Rent")).toHaveAttribute(
      "title",
      /\nTarget: top up to €1,000\.$/,
    );

    await openMenu(page, "Rent");
    await menuItem(page, "Change target…").click();
    await form.getByRole("button", { name: "Remove target" }).click();
    await expect(form).toHaveCount(0);
    await expect(toGo(page, "Rent")).toHaveCount(0);
    await expect(assignTargetsButton(page)).toHaveCount(0);
    await expect(explanation(page, "Rent")).toHaveAttribute(
      "title",
      "Nothing assigned or spent this month.",
    );

    await page.reload();
    await expect(assignedField(page, "Rent")).toBeVisible();
    await expect(toGo(page, "Rent")).toHaveCount(0);
    await openMenu(page, "Rent");
    await expect(menuItem(page, "Set target…")).toBeVisible();
    // A category without a target has nothing to remove.
    await menuItem(page, "Set target…").click();
    await expect(form.getByRole("button", { name: "Remove target" })).toHaveCount(0);
  });

  test("topping up counts what was left at the end of last month, not what is spent now", async ({
    page,
  }) => {
    // Last month: €400 assigned to Groceries and €335 spent, so €65 is left.
    await page.goto(`/?month=${month(-1)}`);
    await assignAndSave(page, "Groceries", "400");
    await page.getByRole("link", { name: "Import from bank" }).click();
    await page.getByLabel("Bank file").setInputFiles({
      name: "groceries.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "Date,Name,Description,Amount",
          `${month(-1)}-15,Fresh Market,Card payment,-335.00`,
          `${month(0)}-01,Corner Shop,Card payment,-50.00`,
        ].join("\n"),
      ),
    });
    await page.getByRole("button", { name: "Import 2 transactions into Main account" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 2 transactions into Main account." }),
    ).toBeVisible();
    for (const payee of ["Fresh Market", "Corner Shop"]) {
      await page.goto("/transactions?show=all");
      const picker = page.getByRole("combobox", { name: new RegExp(`^Category for ${payee} on `) });
      const saved = page.waitForResponse((response) => response.request().method() === "POST");
      await picker.focus();
      await picker.selectOption({ label: "Groceries" });
      await saved;
    }

    await page.goto("/");
    await setTarget(page, "Groceries", "Top up to", "400");
    // €400 less the €65 left; the €50 spent this month does not count.
    await expect(toGo(page, "Groceries")).toHaveText("€335 to go");
    await expect(explanation(page, "Groceries")).toHaveAttribute(
      "title",
      "€65.00 from earlier months \u2212 €50.00 spent\nTarget: top up to €400.",
    );

    await assign(page, "Groceries", "335");
    await expect(toGo(page, "Groceries")).toHaveCount(0);
    await expect(available(page, "Groceries")).toHaveText("€350.00");
  });

  test("Assign targets gives every target what it needs, and every figure follows at once", async ({
    page,
  }) => {
    await setTarget(page, "Rent", "Every month", "1100");
    await setTarget(page, "Groceries", "Top up to", "400");
    await setTarget(page, "Holiday", "By a month", "1200", 6);
    await assignAndSave(page, "Rent", "300");
    await assignAndSave(page, "Eating out", "80");
    await expect(headerFigure(page)).toHaveText("€2,620.00");
    await expect(overviewFigure(page, "Assigned")).toHaveText("€380");
    await expect(page.getByText("Your targets need €1,371.43 more this month.")).toBeVisible();

    // Everything shows before the server has answered.
    await slowConnection(page, 2_000);
    const answered = page.waitForResponse((response) => response.request().method() === "POST");
    await assignTargetsButton(page).click();
    const atOnce = { timeout: 1_000 };
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00", atOnce);
    await expect(assignedField(page, "Groceries")).toHaveValue("400.00", atOnce);
    await expect(assignedField(page, "Holiday")).toHaveValue("171.43", atOnce);
    await expect(assignedField(page, "Eating out")).toHaveValue("80.00", atOnce);
    await expect(headerFigure(page)).toHaveText("€1,248.57", atOnce);
    await expect(overviewFigure(page, "Assigned")).toHaveText("€1,751", atOnce);
    await expect(anyToGo(page)).toHaveCount(0, atOnce);
    await expect(page.getByText(/^Your targets need/)).toHaveCount(0, atOnce);

    // And it is stored.
    await answered;
    await page.reload();
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
    await expect(assignedField(page, "Holiday")).toHaveValue("171.43");
    await expect(headerFigure(page)).toHaveText("€1,248.57");
    await expect(assignTargetsButton(page)).toHaveCount(0);
  });

  test("Assign targets assigns it all when there is not enough, and Ready to assign turns red", async ({
    page,
  }) => {
    await setTarget(page, "Rent", "Every month", "1100");
    await setTarget(page, "Holiday", "Every month", "2400");
    await expect(page.getByText("Your targets need €3,500 more this month.")).toBeVisible();

    await assignTargetsButton(page).click();
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
    await expect(assignedField(page, "Holiday")).toHaveValue("2,400.00");
    await expect(headerFigure(page)).toHaveText("-€500.00");
    await expect(page.getByText("Assigned more than you have")).toBeVisible();
    await expect(assignTargetsButton(page)).toHaveCount(0);
  });

  test("while targets need money, their line takes the place of last month's", async ({ page }) => {
    await assignAndSave(page, "Rent", "300");
    await page.goto(`/?month=${month(1)}`);
    const lastMonthLine = page.getByText(/^Nothing assigned in/);
    await expect(lastMonthLine).toBeVisible();

    await setTarget(page, "Groceries", "Every month", "50");
    await expect(targetsLine(page)).toHaveText(
      "Your target needs €50 more this month. Assign targets",
    );
    await expect(lastMonthLine).toHaveCount(0);

    await openMenu(page, "Groceries");
    await menuItem(page, "Change target…").click();
    await targetForm(page, "Groceries").getByRole("button", { name: "Remove target" }).click();
    await expect(assignTargetsButton(page)).toHaveCount(0);
    await expect(lastMonthLine).toBeVisible();
  });

  test("a target whose month has passed needs nothing, and says so", async ({ page }) => {
    // By the end of this month: all of it, now.
    await setTarget(page, "Holiday", "By a month", "1200", 0);
    await expect(toGo(page, "Holiday")).toHaveText("€1,200 to go");

    await page.goto(`/?month=${month(1)}`);
    await expect(assignedField(page, "Holiday")).toBeVisible();
    await expect(toGo(page, "Holiday")).toHaveCount(0);
    await expect(explanation(page, "Holiday")).toHaveAttribute(
      "title",
      `Nothing assigned or spent this month.\nTarget: €1,200 by ${monthLabel(0, "long")}, which has passed.`,
    );
  });
});

test.describe("in Dutch, with amounts written the Dutch way", () => {
  test.use({ locale: "nl-NL", app: { seed: true, locale: "nl-NL" } });

  test("targets are set, shown and assigned in Dutch", async ({ page }) => {
    // Next month, where the demo data has nothing assigned yet.
    await page.goto(`/?month=${month(1)}`);
    const row = (name: string) =>
      page.getByRole("row").filter({ has: page.getByRole("button", { name, exact: true }) });
    const field = (name: string) => page.getByRole("textbox", { name: `Toegewezen aan ${name}` });

    async function setDutchTarget(name: string, kind: string, amount: string, by?: number) {
      await row(name).hover();
      await page.getByRole("button", { name: `Acties voor ${name}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Doel instellen…" }).click();
      const form = page.getByRole("form", { name: `Doel voor ${name}` });
      await form.getByRole("combobox", { name: "Soort doel" }).selectOption({ label: kind });
      await form.getByRole("textbox", { name: "Doelbedrag" }).fill(amount);
      if (by !== undefined) {
        await form
          .getByRole("combobox", { name: "Doelmaand" })
          .selectOption({ label: monthLabel(by, "short", "nl-NL") });
      }
      await form.getByRole("button", { name: "Opslaan" }).click();
      await expect(form).toHaveCount(0);
    }

    await setDutchTarget("Rent", "Elke maand", "1.100");
    await setDutchTarget("Eating out", "Aanvullen tot", "400,50");
    await setDutchTarget("Holiday", "Op datum", "1.200", 6);

    // Amounts in LOCALE nl-NL: "€ 1.100", with a space that does not break.
    await expect(row("Rent").getByText(/^nog /)).toHaveText(/^nog €\s1\.100$/);
    await expect(field("Rent")).toHaveAccessibleDescription(
      /^Je doel heeft deze maand nog €\s1\.100 nodig\.$/,
    );
    await expect(row("Eating out").getByText(/^nog /)).toHaveText(/^nog €\s\d+,\d\d$/);
    await expect(row("Holiday").getByText(/^nog /)).toHaveText(/^nog €\s[\d.,]+$/);
    const tip = (name: string) => row(name).getByRole("cell").last().locator("[title]");
    await expect(tip("Rent")).toHaveAttribute("title", /\nDoel: €\u00a01\.100 per maand\.$/);
    await expect(tip("Eating out")).toHaveAttribute(
      "title",
      /\nDoel: aanvullen tot €\u00a0400,50\.$/,
    );
    await expect(tip("Holiday")).toHaveAttribute(
      "title",
      new RegExp(`\\nDoel: €\\u00a01\\.200 in ${monthLabel(6, "long", "nl-NL")}\\.$`),
    );

    await expect(
      page.getByText(/^Je doelen hebben deze maand nog €\s[\d.,]+ nodig\./),
    ).toBeVisible();
    await page.getByRole("button", { name: "Doelen toewijzen" }).click();
    await expect(field("Rent")).toHaveValue("1.100,00");
    await expect(page.getByRole("table").getByText(/^nog /)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Doelen toewijzen" })).toHaveCount(0);
  });
});
