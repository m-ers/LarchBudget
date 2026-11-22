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
  breakdownLine,
  categoryRow,
  countAnswers,
  groupTotal,
  headerFigure,
  menuButton,
  menuItem,
  monthFromNow,
  openMenu,
  openReadyBreakdown,
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

/** The ◎ at the start of a category's Assigned field, in either form. */
const mark = (page: Page, name: string) => categoryRow(page, name).locator("[data-target-mark]");

/** The ◎ as the button that assigns what the target still needs. */
const targetButton = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^Assign the target for ${name}: `) });

/** Every ◎ that is a button, in the budget table. */
const anyTargetButton = (page: Page) =>
  page.getByRole("table").getByRole("button", { name: /^Assign the target for / });

/** The brand colour, as computed: the ◎ while its target needs money. */
const BRAND = "rgb(23, 89, 75)";

/** Checks that a category's ◎ asks for `amount`, in colour, and that its field shows it faded when empty. */
async function expectAsks(page: Page, name: string, amount: string, target: string) {
  const button = targetButton(page, name);
  await expect(button).toHaveAccessibleName(`Assign the target for ${name}: ${amount}`);
  await expect(button).toHaveAttribute("title", `${target} · ${amount} to go. Click to assign it.`);
  await expect(button).toHaveCSS("color", BRAND);
  await expect(assignedField(page, name)).toHaveAccessibleDescription(
    `${target} · ${amount} to go.`,
  );
}

/** Checks that a category's ◎ is grey and no button, saying `text`. */
async function expectQuiet(page: Page, name: string, text: string) {
  await expect(targetButton(page, name)).toHaveCount(0);
  await expect(mark(page, name)).toHaveAttribute("title", text);
  await expect(mark(page, name)).toHaveText(text);
  await expect(mark(page, name)).toHaveClass(/\btext-muted\//);
  await expect(mark(page, name)).not.toHaveCSS("color", BRAND);
  await expect(assignedField(page, name)).toHaveAccessibleDescription(text);
}

/** The tooltip that explains a category's Available amount. */
const explanation = (page: Page, name: string) => available(page, name).locator("[title]");

/** The small button in the header, under the month: "◎ €455 to assign". */
const assignTargetsButton = (page: Page) =>
  page.getByRole("button", { name: / to assign, for your targets?$/ });

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
    await expectAsks(page, "Rent", "€1,100", "Target: €1,100 every month");
    // Nothing assigned yet: the empty field shows what the target asks, faded.
    await expect(assignedField(page, "Rent")).toHaveValue("");
    await expect(assignedField(page, "Rent")).toHaveAttribute("placeholder", "1,100.00");

    await setTarget(page, "Groceries", "Top up to", "400");
    await expectAsks(page, "Groceries", "€400", "Target: top up to €400");
    await expect(assignedField(page, "Groceries")).toHaveAttribute("placeholder", "400.00");

    // Six months from now: seven months, this one included, of €171.43 (rounded up).
    await setTarget(page, "Holiday", "By a month", "1200", 6);
    await expectAsks(page, "Holiday", "€171.43", `Target: €1,200 by ${monthLabel(6, "long")}`);
    await expect(assignedField(page, "Holiday")).toHaveAttribute("placeholder", "171.43");

    // Without a target, nothing shows.
    await expect(mark(page, "Eating out")).toHaveCount(0);
    await expect(assignedField(page, "Eating out")).toHaveAttribute("placeholder", "0.00");
    await expect(assignedField(page, "Eating out")).toHaveAccessibleDescription("");
    // The header offers to assign all of it.
    await expect(assignTargetsButton(page)).toHaveAccessibleName(
      "€1,671.43 to assign, for your targets",
    );
    await expect(assignTargetsButton(page)).toHaveText("€1,671.43 to assign");
    await expect(assignTargetsButton(page)).toHaveAttribute(
      "title",
      "Your targets need €1,671.43 more this month.",
    );

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

    // What is typed in Assigned counts at once: partly there, still in colour.
    await assign(page, "Rent", "300");
    await expect(assignedField(page, "Rent")).toHaveValue("300.00");
    await expectAsks(page, "Rent", "€800", "Target: €1,100 every month");
    await expect(assignTargetsButton(page)).toHaveText("€1,371.43 to assign");
    await assignAndSave(page, "Rent", "1100");
    await expectQuiet(page, "Rent", "Target: €1,100 every month · reached.");

    // Stored, and the menu offers to change it.
    await page.reload();
    await expectAsks(page, "Groceries", "€400", "Target: top up to €400");
    await expectAsks(page, "Holiday", "€171.43", `Target: €1,200 by ${monthLabel(6, "long")}`);
    await expectQuiet(page, "Rent", "Target: €1,100 every month · reached.");
    await openMenu(page, "Rent");
    await expect(menuItem(page, "Change target…")).toBeVisible();
    await expect(menuItem(page, "Set target…")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Next month needs it again; last month, which is over, needs nothing,
    // and its ◎ only names the target.
    await page.goto(`/?month=${month(1)}`);
    await expectAsks(page, "Rent", "€1,100", "Target: €1,100 every month");
    await expect(assignedField(page, "Rent")).toHaveAttribute("placeholder", "1,100.00");
    await page.goto(`/?month=${month(-1)}`);
    await expect(assignedField(page, "Rent")).toBeVisible();
    await expect(anyTargetButton(page)).toHaveCount(0);
    await expect(assignTargetsButton(page)).toHaveCount(0);
    await expectQuiet(page, "Rent", "Target: €1,100 every month.");
    await expectQuiet(page, "Groceries", "Target: top up to €400.");
    await expect(assignedField(page, "Rent")).toHaveAttribute("placeholder", "0.00");
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
    await expect(targetButton(page, "Rent")).toHaveAccessibleName(
      "Assign the target for Rent: €1,100",
    );

    // Changing starts from the amount, selected, so typing replaces it.
    await page.keyboard.press("Enter");
    await menuItem(page, "Change target…").press("Enter");
    await expect(amount).toHaveValue("1100.00");
    await page.keyboard.type("1200");
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    await expect(targetButton(page, "Rent")).toHaveAccessibleName(
      "Assign the target for Rent: €1,200",
    );

    // Only an amount above zero.
    await page.keyboard.press("Enter");
    await menuItem(page, "Change target…").press("Enter");
    await page.keyboard.type("0");
    await page.keyboard.press("Enter");
    await expect(alert(page, "Enter an amount above zero.")).toBeVisible();
    await page.keyboard.type("abc");
    await page.keyboard.press("Enter");
    await expect(alert(page, "That is not an amount.")).toBeVisible();
    // An amount the server refuses as too large is refused before it is
    // sent, so it never shows in the row.
    const answers = countAnswers(page);
    await amount.fill("1000000000.01");
    await expect(alert(page, "That is not an amount.")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(alert(page, "That is not an amount.")).toBeVisible();
    await expect(assignedField(page, "Rent")).toHaveAttribute("placeholder", "1,200.00");
    expect(answers()).toBe(0);
    // Escape closes the form, back to the menu button, and nothing changed.
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    await expect(menuButton(page, "Rent")).toBeFocused();
    await expect(assignedField(page, "Rent")).toHaveAttribute("placeholder", "1,200.00");

    await openMenu(page, "Rent");
    await menuItem(page, "Change target…").click();
    await amount.fill("50");
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toHaveCount(0);
    await page.reload();
    await expect(targetButton(page, "Rent")).toHaveAccessibleName(
      "Assign the target for Rent: €1,200",
    );
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
    await expectAsks(page, "Rent", "€1,000", "Target: top up to €1,000");
    await expect(explanation(page, "Rent")).toHaveAttribute(
      "title",
      /\nTarget: top up to €1,000\.$/,
    );

    await openMenu(page, "Rent");
    await menuItem(page, "Change target…").click();
    await form.getByRole("button", { name: "Remove target" }).click();
    await expect(form).toHaveCount(0);
    await expect(mark(page, "Rent")).toHaveCount(0);
    await expect(assignedField(page, "Rent")).toHaveAttribute("placeholder", "0.00");
    await expect(assignTargetsButton(page)).toHaveCount(0);
    await expect(explanation(page, "Rent")).toHaveAttribute(
      "title",
      "Nothing assigned or spent this month.",
    );

    await page.reload();
    await expect(assignedField(page, "Rent")).toBeVisible();
    await expect(mark(page, "Rent")).toHaveCount(0);
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
    await expectAsks(page, "Groceries", "€335", "Target: top up to €400");
    await expect(assignedField(page, "Groceries")).toHaveAttribute("placeholder", "335.00");
    await expect(explanation(page, "Groceries")).toHaveAttribute(
      "title",
      "€65.00 from earlier months \u2212 €50.00 spent\nTarget: top up to €400.",
    );

    await assign(page, "Groceries", "335");
    await expectQuiet(page, "Groceries", "Target: top up to €400 · reached.");
    await expect(available(page, "Groceries")).toHaveText("€350.00");
  });

  test("Assign targets in the header gives every target what it needs, and every figure follows at once", async ({
    page,
  }) => {
    await setTarget(page, "Rent", "Every month", "1100");
    await setTarget(page, "Groceries", "Top up to", "400");
    await setTarget(page, "Holiday", "By a month", "1200", 6);
    await assignAndSave(page, "Rent", "300");
    await assignAndSave(page, "Eating out", "80");
    await expect(headerFigure(page)).toHaveText("€2,620.00");
    const assignedThisMonth = () => breakdownLine(page, `Assigned in ${monthFromNow(0)}`);
    await openReadyBreakdown(page);
    await expect(assignedThisMonth()).toHaveText("− €380.00");
    await page.keyboard.press("Escape");
    await expect(assignTargetsButton(page)).toHaveText("€1,371.43 to assign");

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
    await expect(anyTargetButton(page)).toHaveCount(0, atOnce);
    await expect(assignTargetsButton(page)).toHaveCount(0, atOnce);
    await expect(mark(page, "Holiday")).toHaveAttribute(
      "title",
      `Target: €1,200 by ${monthLabel(6, "long")} · reached.`,
      atOnce,
    );
    await openReadyBreakdown(page);
    await expect(assignedThisMonth()).toHaveText("− €1,751.43", atOnce);
    await page.keyboard.press("Escape");

    // And it is stored.
    await answered;
    await page.reload();
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
    await expect(assignedField(page, "Holiday")).toHaveValue("171.43");
    await expect(headerFigure(page)).toHaveText("€1,248.57");
    await expect(assignTargetsButton(page)).toHaveCount(0);
    await expectQuiet(page, "Groceries", "Target: top up to €400 · reached.");
  });

  test("Assign targets from the keyboard leaves the focus on the month, and says it is done", async ({
    page,
  }) => {
    await setTarget(page, "Rent", "Every month", "1100");
    // The button comes right after the links to other months.
    await page.getByRole("link", { name: "Next month" }).focus();
    await page.keyboard.press("Tab");
    await expect(assignTargetsButton(page)).toBeFocused();
    // White, with its ring in white, on the header's green.
    await expect(assignTargetsButton(page)).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(assignTargetsButton(page)).toHaveCSS("outline-color", "rgb(255, 255, 255)");
    await page.keyboard.press("Enter");

    await expect(assignTargetsButton(page)).toHaveCount(0);
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
    // The button has gone, but the focus has not fallen back to the page.
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await expect(page.getByRole("status")).toHaveText("Targets assigned.");
  });

  test("the ◎ assigns what one target is missing, and every figure follows at once", async ({
    page,
  }) => {
    await setTarget(page, "Rent", "Every month", "1100");
    await setTarget(page, "Groceries", "Top up to", "400");
    await assignAndSave(page, "Rent", "300");
    await expect(headerFigure(page)).toHaveText("€2,700.00");
    await expect(assignTargetsButton(page)).toHaveText("€1,200 to assign");

    // Everything shows before the server has answered.
    await slowConnection(page, 2_000);
    const answered = page.waitForResponse((response) => response.request().method() === "POST");
    await targetButton(page, "Rent").click();
    const atOnce = { timeout: 1_000 };
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00", atOnce);
    await expect(available(page, "Rent")).toHaveText("€1,100.00", atOnce);
    await expect(groupTotal(page, "Bills")).toHaveText("€1,100.00", atOnce);
    await expect(headerFigure(page)).toHaveText("€1,900.00", atOnce);
    await expect(assignTargetsButton(page)).toHaveText("€400 to assign", atOnce);
    await expect(mark(page, "Rent")).toHaveAttribute(
      "title",
      "Target: €1,100 every month · reached.",
      atOnce,
    );
    // Only its own target: Groceries still asks.
    await expect(assignedField(page, "Groceries")).toHaveValue("", atOnce);
    await expect(targetButton(page, "Groceries")).toBeVisible();

    // And it is stored.
    await answered;
    await page.reload();
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
    await expect(headerFigure(page)).toHaveText("€1,900.00");
    await expectQuiet(page, "Rent", "Target: €1,100 every month · reached.");
  });

  test("the ◎ is reached with Tab and keeps the focus once used; the column's keys pass it", async ({
    page,
  }) => {
    await setTarget(page, "Rent", "Every month", "1100");
    await setTarget(page, "Groceries", "Top up to", "400");

    // Tab and the arrow keys go from field to field, past the ◎.
    await assignedField(page, "Rent").click();
    await page.keyboard.press("Tab");
    await expect(assignedField(page, "Groceries")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(assignedField(page, "Rent")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(assignedField(page, "Groceries")).toBeFocused();
    // Shift+Tab reaches it: it comes between the menu button and the field.
    await page.keyboard.press("Shift+Tab");
    await expect(targetButton(page, "Groceries")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(menuButton(page, "Groceries")).toBeFocused();

    await menuButton(page, "Rent").focus();
    await page.keyboard.press("Tab");
    await expect(targetButton(page, "Rent")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
    // No longer a button, but the focus stays on the ◎, and it is said.
    await expect(mark(page, "Rent")).toBeFocused();
    await expect(mark(page, "Rent")).toHaveAttribute(
      "title",
      "Target: €1,100 every month · reached.",
    );
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await expect(page.getByRole("status")).toHaveText("Assigned €1,100 to Rent.");
    // Tab goes on to its field, which shows the amount as it is.
    await page.keyboard.press("Tab");
    await expect(assignedField(page, "Rent")).toBeFocused();
    await expect(assignedField(page, "Rent")).toHaveValue("1100.00");
    await page.keyboard.press("Escape");
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");

    // Space works too.
    await menuButton(page, "Groceries").focus();
    await page.keyboard.press("Tab");
    await expect(targetButton(page, "Groceries")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(assignedField(page, "Groceries")).toHaveValue("400.00");
    await expect(mark(page, "Groceries")).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("Assigned €400 to Groceries.");
  });

  test("Assign targets assigns it all when there is not enough, and Ready to assign turns red", async ({
    page,
  }) => {
    await setTarget(page, "Rent", "Every month", "1100");
    await setTarget(page, "Holiday", "Every month", "2400");
    await expect(assignTargetsButton(page)).toHaveText("€3,500 to assign");

    await assignTargetsButton(page).click();
    await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
    await expect(assignedField(page, "Holiday")).toHaveValue("2,400.00");
    await expect(headerFigure(page)).toHaveText("-€500.00");
    await expect(page.getByText("Assigned more than you have")).toBeVisible();
    await expect(assignTargetsButton(page)).toHaveCount(0);
  });

  test("while targets need money, assigning the same as last month waits", async ({ page }) => {
    await assignAndSave(page, "Rent", "300");
    await page.goto(`/?month=${month(1)}`);
    const lastMonthLine = page.getByText(/^Nothing assigned in/);
    await expect(lastMonthLine).toBeVisible();
    await expect(assignTargetsButton(page)).toHaveCount(0);

    await setTarget(page, "Groceries", "Every month", "50");
    await expect(assignTargetsButton(page)).toHaveText("€50 to assign");
    await expect(assignTargetsButton(page)).toHaveAccessibleName("€50 to assign, for your target");
    await expect(assignTargetsButton(page)).toHaveAttribute(
      "title",
      "Your target needs €50 more this month.",
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
    await expectAsks(page, "Holiday", "€1,200", `Target: €1,200 by ${monthLabel(0, "long")}`);

    await page.goto(`/?month=${month(1)}`);
    await expect(assignedField(page, "Holiday")).toBeVisible();
    await expectQuiet(
      page,
      "Holiday",
      `Target: €1,200 by ${monthLabel(0, "long")}, which has passed.`,
    );
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
    const button = (name: string) =>
      page.getByRole("button", { name: new RegExp(`^Doel van ${name} toewijzen: `) });
    const dutchMark = (name: string) => row(name).locator("[data-target-mark]");
    const headerButton = page.getByRole("button", { name: / toewijzen aan je doelen?$/ });

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
    await expect(field("Rent")).toHaveValue("");
    await expect(field("Rent")).toHaveAttribute("placeholder", "1.100,00");
    await expect(button("Rent")).toHaveAccessibleName(/^Doel van Rent toewijzen: €\s1\.100$/);
    await expect(button("Rent")).toHaveAttribute(
      "title",
      /^Doel: €\s1\.100 per maand · nog €\s1\.100\. Klik om toe te wijzen\.$/,
    );
    await expect(button("Rent")).toHaveCSS("color", BRAND);
    await expect(field("Rent")).toHaveAccessibleDescription(
      /^Doel: €\s1\.100 per maand · nog €\s1\.100\.$/,
    );
    await expect(field("Eating out")).toHaveAttribute("placeholder", /^\d+,\d\d$/);
    await expect(button("Eating out")).toHaveAttribute(
      "title",
      /^Doel: aanvullen tot €\s400,50 · nog €\s\d+,\d\d\. Klik om toe te wijzen\.$/,
    );
    await expect(button("Holiday")).toHaveAccessibleName(
      /^Doel van Holiday toewijzen: €\s[\d.,]+$/,
    );
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

    await expect(headerButton).toHaveText(/^€\s[\d.,]+ toewijzen$/);
    await expect(headerButton).toHaveAccessibleName(/^€\s[\d.,]+ toewijzen aan je doelen$/);
    await expect(headerButton).toHaveAttribute(
      "title",
      /^Je doelen hebben deze maand nog €\s[\d.,]+ nodig\.$/,
    );

    // One target with its ◎, then the rest from the header.
    await button("Rent").click();
    await expect(field("Rent")).toHaveValue("1.100,00");
    await expect(dutchMark("Rent")).toHaveAttribute(
      "title",
      /^Doel: €\s1\.100 per maand · gehaald\.$/,
    );
    await expect(page.getByRole("status")).toHaveText(/^€\s1\.100 toegewezen aan Rent\.$/);

    await headerButton.click();
    await expect(page.getByRole("status")).toHaveText("Doelen toegewezen.");
    await expect(page.getByRole("table").getByRole("button", { name: /^Doel van / })).toHaveCount(
      0,
    );
    await expect(headerButton).toHaveCount(0);
    await expect(dutchMark("Eating out")).toHaveAttribute(
      "title",
      /^Doel: aanvullen tot €\s400,50 · gehaald\.$/,
    );
  });
});
