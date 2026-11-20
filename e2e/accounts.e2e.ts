import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { today } from "../src/lib/dates";
import { addAccount, alert, headerFigure } from "./budget-page";
import { expect, test } from "./fixtures";

/** The "Add an account" form. */
const addForm = (page: Page) =>
  page.getByRole("region", { name: "Add an account" }).filter({ visible: true });

/** The "Edit balance" form under an account's row. */
const balanceForm = (page: Page, name: string) =>
  page.getByRole("form", { name: `Balance of ${name}` });

/** The fields of a balance. Their labels hold their help text too. */
const amountField = (scope: Locator) => scope.getByRole("textbox", { name: /^Balance\b/ });
const dateField = (scope: Locator) => scope.getByRole("textbox", { name: /^On\b/ });

/** An account's row in the table on the Accounts page, found by its name. */
const accountRow = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByRole("button", { name, exact: true }) });

/** What an account holds, at the end of its row (after the "Edit balance" button). */
async function expectBalance(page: Page, name: string, amount: string) {
  const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(accountRow(page, name).getByRole("cell").last()).toHaveText(
    new RegExp(`^(Edit balance)?${escaped}$`),
  );
}

/** Clicks one of the buttons that show when the row is hovered. */
async function rowAction(page: Page, account: string, action: string) {
  await accountRow(page, account).hover();
  await page.getByRole("button", { name: `${action} ${account}`, exact: true }).click();
}

/** Answers the next confirmation, and returns its question. */
function answerNextQuestion(page: Page, accept: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once("dialog", (dialog) => {
      resolve(dialog.message());
      void (accept ? dialog.accept() : dialog.dismiss());
    });
  });
}

/** Imports one of the made-up bank files in e2e/files into the first account. */
async function importFile(page: Page, file: string, count: number, account: string) {
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(path.join("e2e", "files", file));
  await page.getByRole("button", { name: `Import ${count} transactions into ${account}` }).click();
  await expect(page.getByRole("heading", { name: /^Imported / })).toBeVisible();
}

test.describe("adding an account", () => {
  test("importing older history does not change the balance entered today", async ({ page }) => {
    await addAccount(page, "Checking", "1954.90");
    await importFile(page, "ing.csv", 6, "Checking");

    await page.getByRole("link", { name: "Accounts" }).click();
    await expectBalance(page, "Checking", "€1,954.90");
    await expect(headerFigure(page)).toHaveText("€1,954.90");
  });

  test("an account is added with the balance it held at the end of an earlier day", async ({
    page,
  }) => {
    await page.goto("/accounts");
    const form = addForm(page);
    await expect(dateField(form)).toHaveValue(today());
    await expect(dateField(form)).toHaveAttribute("max", today());

    await form.getByRole("textbox", { name: "Name" }).fill("Checking");
    await amountField(form).fill("1954.90");
    await dateField(form).fill("2026-11-18");
    await form.getByRole("button", { name: "Add account" }).click();
    await expectBalance(page, "Checking", "€1,954.90");
    // Ready for the next account.
    await expect(dateField(form)).toHaveValue(today());

    // This file runs to the 19th: only that day's 6.80 comes off the balance.
    await importFile(page, "ing-overlap.csv", 4, "Checking");
    await page.getByRole("link", { name: "Accounts" }).click();
    await expectBalance(page, "Checking", "€1,948.10");
  });

  test("a balance from a day in the future is refused", async ({ page }) => {
    await page.goto("/accounts");
    const form = addForm(page);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await form.getByRole("textbox", { name: "Name" }).fill("Checking");
    // The browser does not offer such a day; the server refuses it too.
    await dateField(form).evaluate((field) => field.removeAttribute("max"));
    await dateField(form).fill(today(tomorrow));
    await form.getByRole("button", { name: "Add account" }).click();
    await expect(alert(page, "The date cannot be in the future.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});

test("accounts are renamed in place, and names are unique ignoring case", async ({ page }) => {
  await addAccount(page, "Checking", "100");
  await addAccount(page, "Savings", "50");

  await page.getByRole("button", { name: "Checking", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Main account");
  await page.keyboard.press("Enter");
  await expect(accountRow(page, "Main account")).toBeVisible();

  await page.getByRole("button", { name: "Savings", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("main ACCOUNT");
  await page.keyboard.press("Enter");
  await expect(alert(page, 'You already have an account called "main ACCOUNT".')).toBeVisible();
  await page.getByRole("textbox", { name: "Account name" }).press("Escape");
  await expect(accountRow(page, "Savings")).toBeVisible();

  const form = addForm(page);
  await form.getByRole("textbox", { name: "Name" }).fill("SAVINGS");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(alert(page, 'You already have an account called "SAVINGS".')).toBeVisible();
});

test("accounts are listed alphabetically, ignoring case", async ({ page }) => {
  await addAccount(page, "Visa", "0");
  await addAccount(page, "savings", "0");
  await addAccount(page, "Checking", "0");
  await expect(
    page.getByRole("button", { name: /^(Checking|savings|Visa)$/ }).filter({ visible: true }),
  ).toHaveText(["Checking", "savings", "Visa"]);
});

test("an account's type is picked in its row", async ({ page }) => {
  await addAccount(page, "Visa", "-250");
  const type = page.getByRole("combobox", { name: "Type of Visa" });
  await expect(type).toHaveValue("checking");

  await type.selectOption({ label: "Credit card" });
  await expect(type).toHaveValue("credit");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Type of Visa" })).toHaveValue("credit");
});

test("an account's balance and its day are changed in place", async ({ page }) => {
  await addAccount(page, "Checking", "1954.90");
  await importFile(page, "ing.csv", 6, "Checking");
  await page.getByRole("link", { name: "Accounts" }).click();

  await rowAction(page, "Checking", "Edit balance of");
  const form = balanceForm(page, "Checking");
  await expect(amountField(form)).toBeFocused();
  await expect(amountField(form)).toHaveValue("1954.90");
  await expect(dateField(form)).toHaveValue(today());

  // Escape leaves it as it was.
  await amountField(form).fill("1");
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expectBalance(page, "Checking", "€1,954.90");

  await rowAction(page, "Checking", "Edit balance of");
  await amountField(form).fill("lots");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(alert(page, "The balance is not an amount.")).toBeVisible();

  // On the 17th it held 2,100.00; the 45.10 spent on the 18th comes off that.
  await amountField(form).fill("2100");
  await dateField(form).fill("2026-11-17");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  await expectBalance(page, "Checking", "€2,054.90");
  await expect(headerFigure(page)).toHaveText("€2,054.90");

  await rowAction(page, "Checking", "Edit balance of");
  await expect(amountField(form)).toHaveValue("2100.00");
  await expect(dateField(form)).toHaveValue("2026-11-17");
});

test("an account that holds nothing can be closed, and reopened", async ({ page }) => {
  await addAccount(page, "Checking", "100");
  await addAccount(page, "Savings", "500");

  await rowAction(page, "Savings", "Close");
  await expect(alert(page, "Only an account that holds nothing can be closed.")).toBeVisible();

  // The money was moved out today.
  await rowAction(page, "Savings", "Edit balance of");
  await amountField(balanceForm(page, "Savings")).fill("0");
  await balanceForm(page, "Savings").getByRole("button", { name: "Save" }).click();
  await expectBalance(page, "Savings", "€0.00");

  await rowAction(page, "Savings", "Close");
  await expect(accountRow(page, "Savings")).toHaveCount(0);
  await expect(page.getByText("Closed accounts:")).toBeVisible();

  // Nothing can be imported into it any more.
  await page.getByRole("link", { name: "Import from bank" }).click();
  await expect(page.getByRole("combobox", { name: "Into account" }).getByRole("option")).toHaveText(
    ["Checking"],
  );

  await page.getByRole("link", { name: "Accounts" }).click();
  await page.getByRole("button", { name: "Reopen Savings" }).click();
  await expect(accountRow(page, "Savings")).toBeVisible();
  await expect(page.getByText("Closed accounts:")).toHaveCount(0);
});

test("closing the last account does not bring back the welcome", async ({ page }) => {
  await addAccount(page, "Cash", "0");
  await rowAction(page, "Cash", "Close");
  await expect(page.getByText("All your accounts are closed.")).toBeVisible();

  await page.getByRole("link", { name: "Budget" }).click();
  await expect(page.getByRole("textbox", { name: "New group name" })).toBeVisible();
  await expect(page.getByText("Welcome to LarchBudget.")).toHaveCount(0);
});

test("deleting an account asks first and says how many transactions go with it", async ({
  page,
}) => {
  await addAccount(page, "Checking", "1000");
  await addAccount(page, "Savings", "500");
  await importFile(page, "ing.csv", 6, "Checking");
  await page.getByRole("link", { name: "Accounts" }).click();

  let question = answerNextQuestion(page, false);
  await rowAction(page, "Checking", "Delete");
  expect(await question).toBe(
    'Delete "Checking" and its 6 transactions? What was spent from it disappears from your categories. This cannot be undone.',
  );
  await expect(accountRow(page, "Checking")).toBeVisible();

  question = answerNextQuestion(page, true);
  await rowAction(page, "Checking", "Delete");
  await question;
  await expect(accountRow(page, "Checking")).toHaveCount(0);
  await expect(headerFigure(page)).toHaveText("€500.00");
  await expect(page.getByRole("link", { name: /^Transactions/ })).not.toContainText("to sort");

  // Only a starting balance: a plain question.
  question = answerNextQuestion(page, true);
  await rowAction(page, "Savings", "Delete");
  expect(await question).toBe('Delete "Savings"?');
  await expect(
    page.getByText(
      "No accounts yet. Add the accounts your money is in, with what is in them today.",
    ),
  ).toBeVisible();
});
