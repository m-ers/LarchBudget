import path from "node:path";
import type { Page } from "@playwright/test";
import { addAccount, alert, headerFigure } from "./budget-page";
import { expect, test } from "./fixtures";

/** Made-up bank files in the style of a Dutch bank's export. */
const file = (name: string) => path.join("e2e", "files", name);

async function chooseFile(page: Page, name: string) {
  await page.getByLabel("Bank file").setInputFiles(file(name));
}

/** The option a column picker shows, e.g. "Datum · 20261118". */
const picked = (page: Page, label: string) =>
  page.getByRole("combobox", { name: label, exact: true }).locator("option:checked");

const summary = (page: Page) => page.locator("main").filter({ visible: true });

test("without an account, the import asks for one first", async ({ page }) => {
  await page.goto("/import");
  await expect(
    page.getByText("Transactions are imported into an account, and you have none yet."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add an account" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
});

test.describe("with an account", () => {
  test.beforeEach(async ({ page }) => {
    await addAccount(page, "Checking", "1000");
    await page.getByRole("link", { name: "Import from bank" }).click();
    await expect(page.getByText("Drop your bank's CSV file here")).toBeVisible();
  });

  test("a file that is not a CSV is refused", async ({ page }) => {
    await chooseFile(page, "fake.csv");
    await expect(
      alert(page, "This is not a CSV file. Choose CSV when you download from your bank."),
    ).toBeVisible();
  });

  test("a bank file is recognised, previewed and imported", async ({ page }) => {
    await chooseFile(page, "ing.csv");
    await expect(
      page.getByText("Check that the columns below were recognised correctly."),
    ).toBeVisible();
    await expect(picked(page, "Date")).toHaveText("Datum · 20261118");
    await expect(picked(page, "Amount")).toHaveText("Bedrag (EUR) · 45,10");
    await expect(picked(page, "Money out or in")).toHaveText("Af Bij · Af");
    await expect(picked(page, "Payee")).toHaveText("Naam / Omschrijving · Fresh Market");
    await expect(picked(page, "Note")).toHaveText(/^Mededelingen\s+·\s+Pasvolgnr/);
    await expect(summary(page)).toContainText(
      "6 transactions · Nov 1, 2026 to Nov 18, 2026 · €2,850.00 in · €1,244.10 out",
    );
    await expect(
      page.getByRole("row", { name: /Nov 18, 2026 Fresh Market .* -45\.10/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Nov 1, 2026 Acme Corp .* \+2,850\.00/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 6 transactions into Checking." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Transactions.*6 to sort/ })).toBeVisible();
  });

  test("an overlapping file uses the saved settings, skips what is already there, and can be undone", async ({
    page,
  }) => {
    await chooseFile(page, "ing.csv");
    await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
    await page.getByRole("button", { name: "Import another file" }).click();

    await chooseFile(page, "ing-overlap.csv");
    await expect(
      page.getByText("Read with the settings from your last import into this account."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Import 4 transactions into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 1 transaction into Checking." }),
    ).toBeVisible();
    await expect(page.getByText("3 were already in LarchBudget and were skipped.")).toBeVisible();

    await page.getByRole("button", { name: "Undo this import" }).click();
    await expect(page.getByText("Import undone.")).toBeVisible();
    await expect(page.getByText("1 transaction was removed.")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Transactions.*6 to sort/ })).toBeVisible();
  });

  test("a file without column names: the columns are chosen by hand", async ({ page }) => {
    await chooseFile(page, "noheader.txt");
    await expect(
      page.getByRole("checkbox", { name: "First row holds column names" }),
    ).not.toBeChecked();
    await expect(picked(page, "Date")).toHaveText("Column 3 · 20261103");
    await expect(summary(page)).toContainText(
      "2 transactions · Nov 1, 2026 to Nov 3, 2026 · €2,000.00 in · €850.00 out",
    );

    await page.getByRole("combobox", { name: "Amount", exact: true }).selectOption("6");
    await page.getByRole("combobox", { name: "Payee", exact: true }).selectOption("7");
    await expect(summary(page)).toContainText("€2,850.00 in · €45.10 out");
    await expect(
      page.getByRole("row", { name: /Nov 3, 2026.*BEA Fresh Market.*-45\.10/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Import 2 transactions into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 2 transactions into Checking." }),
    ).toBeVisible();
  });

  test("the same file read with other columns is not imported twice", async ({ page }) => {
    await chooseFile(page, "ing.csv");
    await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
    await page.getByRole("button", { name: "Import another file" }).click();

    await chooseFile(page, "ing.csv");
    await page.getByRole("combobox", { name: "Note", exact: true }).selectOption("-1");
    await page.getByRole("combobox", { name: "Payee", exact: true }).selectOption("7");
    await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
    await expect(page.getByRole("heading", { name: "Nothing new to import." })).toBeVisible();
  });

  test("an import cannot be undone once one of its transactions is sorted", async ({ page }) => {
    await chooseFile(page, "ing.csv");
    await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 6 transactions into Checking." }),
    ).toBeVisible();

    // Sorted in another tab meanwhile, as income.
    const other = await page.context().newPage();
    await other.goto("/transactions");
    await other
      .getByRole("combobox", { name: "Category for Acme Corp on Nov 1, 2026" })
      .selectOption("ready");
    await expect(headerFigure(other)).toHaveText("5");
    await other.close();

    await page.getByRole("button", { name: "Undo this import" }).click();
    await expect(
      alert(
        page,
        "One of these transactions has been sorted since, so this import can no longer be undone.",
      ),
    ).toBeVisible();
  });

  test("the import page starts afresh when you come back to it", async ({ page }) => {
    await chooseFile(page, "ing.csv");
    await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
    await expect(page.getByRole("button", { name: "Undo this import" })).toBeVisible();

    await page.getByRole("link", { name: /^Transactions/ }).click();
    await expect(page.getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Import from bank" }).click();
    await expect(page.getByText("Drop your bank's CSV file here")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo this import" })).toHaveCount(0);
  });
});
