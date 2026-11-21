import { statSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { addAccount, alert, bankFile, chosen, headerFigure } from "./helpers";
import { expect, test } from "./fixtures";

async function chooseFile(page: Page, name: string) {
  await page.getByLabel("Bank file").setInputFiles(bankFile(name));
}

/** The option a column picker shows, e.g. "Datum · 20261118". */
const picked = (page: Page, label: string) =>
  chosen(page.getByRole("combobox", { name: label, exact: true }));

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
    // The field is emptied, so choosing a file of the same name again is noticed.
    await expect(page.getByLabel("Bank file")).toHaveValue("");
  });

  test("a file with as many rows as are allowed is imported", async ({ page }, testInfo) => {
    // 20,000 rows with the header, about 2.5 MB: far more than Next.js accepts as a list.
    const count = 19_999;
    const lines = ['"Datum";"Naam / Omschrijving";"Af Bij";"Bedrag (EUR)";"Mededelingen"'];
    for (let i = 0; i < count; i++) {
      const date = new Date(Date.UTC(2020, 0, 1 + (i % 2000))).toISOString().slice(0, 10);
      lines.push(
        `"${date.replaceAll("-", "")}";"Shop number ${i}";"Af";"${(i % 90) + 1},${String(i % 100).padStart(2, "0")}";"Card payment ${i} at the shop around the corner, with a longer note to fill the line"`,
      );
    }
    const large = testInfo.outputPath("large.csv");
    writeFileSync(large, lines.join("\n") + "\n");
    expect(statSync(large).size).toBeGreaterThan(2_000_000);

    await page.getByLabel("Bank file").setInputFiles(large);
    await page.getByRole("button", { name: /^Import 19,?999 transactions into Checking$/ }).click();
    await expect(
      page.getByRole("heading", { name: /^Imported 19,?999 transactions into Checking\.$/ }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("a bank file is recognised, previewed and imported", async ({ page }) => {
    await chooseFile(page, "ing.csv");
    await expect(
      page.getByText("Check that the columns below were recognised correctly."),
    ).toBeVisible();
    await expect(picked(page, "Date")).toHaveText("Datum · 20261118");
    await expect(picked(page, "Amount")).toHaveText("Bedrag (EUR) · 45,10");
    await expect(picked(page, "Out or in")).toHaveText("Af Bij · Af");
    await expect(picked(page, "Money in")).toHaveText("No separate column");
    // Short labels; what they are for is in a tooltip, and read to screen readers.
    await expect(
      page.getByRole("combobox", { name: "Out or in", exact: true }),
    ).toHaveAccessibleDescription(/^For banks whose amounts have no plus or minus/);
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
    // The totals are first those of the whole file, then only what is new.
    await expect(summary(page)).toContainText("1 new transaction · Nov 19, 2026 to Nov 19, 2026");
    await expect(summary(page)).toContainText("3 were imported before and will be skipped.");
    await expect(
      page.getByRole("row", { name: /Nov 18, 2026 Fresh Market Imported before/ }),
    ).toBeVisible();
    await expect(page.getByRole("row", { name: /Nov 19, 2026 Bakery/ })).not.toContainText(
      "Imported before",
    );
    await page.getByRole("button", { name: "Import 1 new transaction into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 1 transaction into Checking." }),
    ).toBeVisible();
    await expect(page.getByText("3 were already in LarchBudget and were skipped.")).toBeVisible();

    await page.getByRole("button", { name: "Undo this import" }).click();
    await expect(page.getByText("Import undone.")).toBeVisible();
    await expect(page.getByText("1 transaction was removed.")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Transactions.*6 to sort/ })).toBeVisible();
  });

  test("a file without column names: date and amount are found, the payee is chosen by hand", async ({
    page,
  }) => {
    await chooseFile(page, "noheader.txt");
    await expect(
      page.getByRole("checkbox", { name: "First row holds column names" }),
    ).not.toBeChecked();
    await expect(picked(page, "Date")).toHaveText("Column 3 · 20261103");
    // Column 4 is the running balance; the amount is the column that moves it.
    await expect(picked(page, "Amount")).toHaveText("Column 7 · -45,10");
    await expect(summary(page)).toContainText(
      "2 transactions · Nov 1, 2026 to Nov 3, 2026 · €2,850.00 in · €45.10 out",
    );

    await page.getByRole("combobox", { name: "Payee", exact: true }).selectOption("7");
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
    await expect(page.getByRole("button", { name: "Nothing new to import" })).toBeDisabled();
    await expect(summary(page)).toContainText(
      "All 6 transactions in this file were imported before.",
    );
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

  test("every dropdown has room for its text", async ({ page }) => {
    await chooseFile(page, "ing.csv");
    await expect(page.getByRole("button", { name: /^Import \d+ transactions into/ })).toBeVisible();
    // A dropdown with a fixed height cuts its text off when its padding
    // leaves less room than the letters are high.
    const cramped = await page.locator("select:visible").evaluateAll((selects) =>
      selects
        .filter((select) => {
          const style = getComputedStyle(select);
          const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
          return select.clientHeight - padding < parseFloat(style.fontSize);
        })
        .map((select) => select.closest("label")?.textContent?.trim().slice(0, 12)),
    );
    expect(cramped).toEqual([]);
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

  test("separate columns for money out and money in are read, or chosen by hand", async ({
    page,
  }) => {
    await chooseFile(page, "withdrawal-deposit.csv");
    await expect(picked(page, "Amount")).toHaveText("Withdrawal · 45.10");
    await expect(picked(page, "Money in")).toHaveText("Deposit");
    await expect(summary(page)).toContainText(
      "3 transactions · Nov 1, 2026 to Nov 18, 2026 · €2,850.00 in · €48.60 out",
    );
    await expect(
      page.getByRole("row", { name: /Nov 1, 2026 Acme Corp \+2,850\.00/ }),
    ).toBeVisible();

    // Without its own column, the Deposit column is ignored and shows no money in.
    await page.getByRole("combobox", { name: "Money in", exact: true }).selectOption("-1");
    await expect(summary(page)).toContainText("2 transactions");
    await expect(summary(page)).toContainText("Skipped: 1 × no readable amount.");

    await page.getByRole("combobox", { name: "Money in", exact: true }).selectOption("3");
    await page.getByRole("button", { name: "Import 3 transactions into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 3 transactions into Checking." }),
    ).toBeVisible();
  });

  test("dates that could be either order follow the locale and say so", async ({ page }) => {
    await chooseFile(page, "slash-dates.csv");
    await expect(page.getByText("Could be either; check this.")).toBeVisible();
    await expect(picked(page, "Date is written as")).toHaveText("Month, day, year (11/03/2026)");
    await expect(page.getByRole("row", { name: /Nov 3, 2026 Fresh Market -45\.10/ })).toBeVisible();

    await page
      .getByRole("combobox", { name: "Date is written as", exact: true })
      .selectOption("dmy");
    await expect(page.getByText("Could be either; check this.")).toHaveCount(0);
    await expect(
      page.getByRole("row", { name: /Mar 11, 2026 Fresh Market -45\.10/ }),
    ).toBeVisible();
  });

  test("a file that says its dates clearly does not ask", async ({ page }) => {
    await chooseFile(page, "ing.csv");
    await expect(picked(page, "Date is written as")).toHaveText("Year, month, day (2026-11-03)");
    await expect(page.getByText("Could be either; check this.")).toHaveCount(0);
  });

  test("every transaction of a long file can be scrolled to before importing", async ({
    page,
  }, testInfo) => {
    const lines = ["Date,Description,Amount"];
    for (let i = 1; i <= 3000; i++) {
      const date = new Date(Date.UTC(2020, 0, i)).toISOString().slice(0, 10);
      lines.push(`${date},Shop number ${i},-${(i % 90) + 1}.00`);
    }
    for (let i = 1; i <= 30; i++) lines.push(`Total ${i},,`);
    const long = testInfo.outputPath("long.csv");
    writeFileSync(long, lines.join("\n") + "\n");

    await page.getByLabel("Bank file").setInputFiles(long);
    const list = page.getByRole("table", { name: "Transactions in this file" });
    await expect(list.getByRole("row", { name: /Shop number 3000 / })).toHaveCount(0);
    await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(list.getByRole("row", { name: /Shop number 3000 .*-/ })).toBeVisible();
    await expect(list.getByRole("row", { name: /Shop number 1 / })).toHaveCount(0);
    // Only the rows in view are drawn.
    expect(await list.getByRole("row").count()).toBeLessThan(60);

    // The skipped rows are listed too, each with its reason.
    const skipped = page.getByRole("table", { name: "Rows that cannot be read" });
    await skipped.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(
      skipped.getByRole("row", { name: /3031 No readable date Total 30/ }),
    ).toBeVisible();

    // The button stays in view while the list is long.
    await expect(
      page.getByRole("button", { name: "Import 3000 transactions into Checking" }),
    ).toBeInViewport();
  });

  test("changing the account keeps columns chosen by hand, and switches otherwise", async ({
    page,
  }) => {
    await addAccount(page, "Savings", "0");
    await page.getByRole("link", { name: "Import from bank" }).click();
    await chooseFile(page, "noheader.txt");
    await expect(picked(page, "Amount")).toHaveText("Column 7 · -45,10");

    // Nothing was changed yet: the other account's settings (here none) are read.
    await page.getByRole("combobox", { name: "Into account" }).selectOption({ label: "Savings" });
    await expect(picked(page, "Amount")).toHaveText("Column 7 · -45,10");

    await page.getByRole("combobox", { name: "Amount", exact: true }).selectOption("3");
    await page.getByRole("combobox", { name: "Into account" }).selectOption({ label: "Checking" });
    await expect(picked(page, "Amount")).toHaveText("Column 4 · 2000,00");
  });

  test("the account for a file is the one whose settings fit it, else the last one used", async ({
    page,
  }) => {
    await addAccount(page, "Savings", "0");
    await page.getByRole("link", { name: "Import from bank" }).click();
    await chooseFile(page, "noheader.txt");
    await page.getByRole("combobox", { name: "Into account" }).selectOption({ label: "Savings" });
    await page.getByRole("combobox", { name: "Amount", exact: true }).selectOption("3");
    await page.getByRole("button", { name: "Import 2 transactions into Savings" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 2 transactions into Savings." }),
    ).toBeVisible();

    // Only Savings has settings for this layout, so it is chosen, with them.
    await page.getByRole("button", { name: "Import another file" }).click();
    await expect(page.getByRole("combobox", { name: "Into account" })).toHaveValue(/\d+/);
    await chooseFile(page, "noheader.txt");
    await expect(picked(page, "Into account")).toHaveText("Savings");
    await expect(
      page.getByText("Read with the settings from your last import into this account."),
    ).toBeVisible();
    await expect(picked(page, "Amount")).toHaveText("Column 4 · 2000,00");

    // No account has settings for this file: the account of the last import.
    await page.getByRole("button", { name: "Choose another file" }).click();
    await chooseFile(page, "ing.csv");
    await expect(picked(page, "Into account")).toHaveText("Savings");

    // An account picked by hand stays, even when another one fits.
    await page.getByRole("button", { name: "Choose another file" }).click();
    await page.getByRole("combobox", { name: "Into account" }).selectOption({ label: "Checking" });
    await chooseFile(page, "noheader.txt");
    await expect(picked(page, "Into account")).toHaveText("Checking");
    await expect(picked(page, "Amount")).toHaveText("Column 7 · -45,10");

    // The last account is remembered after the page is opened anew.
    await page.reload();
    // A file chosen before React has taken over the page is not noticed.
    await page.waitForFunction(() =>
      Object.keys(document.querySelector("input[type=file]")!).some((key) =>
        key.startsWith("__reactProps"),
      ),
    );
    await chooseFile(page, "ing.csv");
    await expect(picked(page, "Into account")).toHaveText("Savings");
  });

  test("when the separator was guessed wrong, it can be chosen", async ({ page }) => {
    // Every line, the first included, has three commas in its text, which look like the separator.
    await chooseFile(page, "commas-in-text.csv");
    await expect(
      page.getByText("Choose which columns hold the date and the amount."),
    ).toBeVisible();

    await page.getByRole("combobox", { name: "Separator" }).selectOption({ label: "Semicolon" });
    await expect(picked(page, "Date")).toHaveText("Date · 2026-11-01");
    await expect(picked(page, "Amount")).toHaveText("Amount · -1100.00");
    await expect(summary(page)).toContainText("5 transactions · Nov 1, 2026 to Nov 5, 2026");

    await page.getByRole("button", { name: "Import 5 transactions into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 5 transactions into Checking." }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^Transactions/ }).click();
    await expect(
      page.getByRole("combobox", {
        name: "Category for Shop, Main Street, Amsterdam, NL on Nov 2, 2026",
      }),
    ).toBeVisible();
  });

  test("a separator chosen by hand is remembered for the next file of that bank", async ({
    page,
  }) => {
    await chooseFile(page, "commas-in-text.csv");
    await page.getByRole("combobox", { name: "Separator" }).selectOption({ label: "Semicolon" });
    await page.getByRole("button", { name: "Import 5 transactions into Checking" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported 5 transactions into Checking." }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Import another file" }).click();
    await chooseFile(page, "commas-in-text.csv");
    await expect(
      page.getByText("Read with the settings from your last import into this account."),
    ).toBeVisible();
    await expect(chosen(page.getByRole("combobox", { name: "Separator" }))).toHaveText("Semicolon");
    await expect(picked(page, "Amount")).toHaveText("Amount · -1100.00");
  });
});
