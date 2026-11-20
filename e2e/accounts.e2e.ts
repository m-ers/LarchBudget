import path from "node:path";
import type { Page } from "@playwright/test";
import { addAccount, headerFigure } from "./budget-page";
import { expect, test } from "./fixtures";

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
