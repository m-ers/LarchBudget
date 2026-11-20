import path from "node:path";
import type { Page } from "@playwright/test";
import { today } from "../src/lib/dates";
import { addAccount, alert, headerFigure } from "./budget-page";
import { expect, test } from "./fixtures";

/** The "Add an account" form. */
const addForm = (page: Page) =>
  page.getByRole("region", { name: "Add an account" }).filter({ visible: true });

/** The fields of a balance. Their labels hold their help text too. */
const amountField = (scope: Page | ReturnType<typeof addForm>) =>
  scope.getByRole("textbox", { name: /^Balance\b/ });
const dateField = (scope: Page | ReturnType<typeof addForm>) =>
  scope.getByRole("textbox", { name: /^On\b/ });

/** An account's row in the table on the Accounts page. */
const accountRow = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });

/** The Balance cell at the end of an account's row. */
const balanceOf = (page: Page, name: string) => accountRow(page, name).getByRole("cell").last();

/** Imports one of the made-up bank files in e2e/files into the only account. */
async function importFile(page: Page, file: string, count: number, account: string) {
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(path.join("e2e", "files", file));
  await page.getByRole("button", { name: `Import ${count} transactions into ${account}` }).click();
  await expect(page.getByRole("heading", { name: /^Imported / })).toBeVisible();
}

test("importing older history does not change the balance entered today", async ({ page }) => {
  await addAccount(page, "Checking", "1954.90");
  await importFile(page, "ing.csv", 6, "Checking");

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(balanceOf(page, "Checking")).toHaveText("€1,954.90");
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
  await expect(balanceOf(page, "Checking")).toHaveText("€1,954.90");
  // Ready for the next account.
  await expect(dateField(form)).toHaveValue(today());

  // This file runs to the 19th: only that day's 6.80 comes off the balance.
  await importFile(page, "ing-overlap.csv", 4, "Checking");
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(balanceOf(page, "Checking")).toHaveText("€1,948.10");
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
