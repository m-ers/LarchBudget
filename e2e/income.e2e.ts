import path from "node:path";
import type { Page } from "@playwright/test";
import {
  addAccount,
  addCategories,
  addGroup,
  addIncomeCategories,
  alert,
  available,
  category,
  categoryRow,
  clickAway,
  groupTotal,
  headerFigure,
  incomeNames,
  menuItem,
  newIncomeField,
  openMenu,
  spentLine,
} from "./budget-page";
import { expect, test } from "./fixtures";

// Income categories: where money comes in, apart from the groups it is divided over.

test.beforeEach(async ({ page }) => {
  await addAccount(page, "Checking", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries"]);
});

/** Imports e2e/files/ing.csv, whose salary from Acme Corp came in on 1 November 2026. */
async function importBankFile(page: Page) {
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(path.join("e2e", "files", "ing.csv"));
  await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported 6 transactions into Checking." }),
  ).toBeVisible();
}

const salaryPicker = (page: Page) =>
  page.getByRole("combobox", { name: /^Category for Acme Corp on Nov 1, 2026/ });

/** Sorts the imported salary in the "All" list, like a person, and waits until it is saved. */
async function sortSalary(page: Page, option: "ready" | { label: string }) {
  await page.goto("/transactions?show=all");
  const saved = page.waitForResponse((response) => response.request().method() === "POST");
  await salaryPicker(page).focus();
  await salaryPicker(page).selectOption(option);
  await saved;
}

/** Archives a category through its menu, agreeing to the question, and returns the question. */
async function archive(page: Page, name: string): Promise<string> {
  const question = new Promise<string>((resolve) =>
    page.once("dialog", (dialog) => {
      resolve(dialog.message());
      void dialog.accept();
    }),
  );
  await openMenu(page, name);
  await menuItem(page, "Archive").click();
  await expect(category(page, name)).toHaveCount(0);
  return question;
}

test("a salary sorted into an income category shows under Income, with the same Ready to assign as No category", async ({
  page,
}) => {
  await importBankFile(page);
  await sortSalary(page, "ready");
  await expect(salaryPicker(page).locator("option:checked")).toHaveText(
    "No category (income or transfer)",
  );
  await page.goto("/?month=2026-11");
  const ready = await headerFigure(page).innerText();

  // An empty Income section shows its field straight away.
  await expect(newIncomeField(page)).toHaveAttribute(
    "placeholder",
    "New income category, e.g. Salary",
  );
  await addIncomeCategories(page, ["Salary"]);
  await expect(available(page, "Salary")).toHaveText("€0.00");

  await sortSalary(page, { label: "Salary" });
  await page.goto("/?month=2026-11");
  await expect.poll(() => incomeNames(page)).toEqual(["Salary"]);
  await expect(available(page, "Salary")).toHaveText("€2,850.00");
  await expect(groupTotal(page, "Income")).toHaveText("€2,850.00 received");
  // Under the month: what came in, and nothing spent or assigned yet.
  await expect(page.getByText(/^€2,850 received/).filter({ visible: true })).toHaveText(
    /^€2,850 received( · \d+ days? to go)?$/,
  );
  await expect(headerFigure(page)).toHaveText(ready);
  // Nothing can be assigned to it, and nothing is spent from it.
  await expect(categoryRow(page, "Salary").getByRole("textbox")).toHaveCount(0);
  await expect(categoryRow(page, "Salary").getByRole("cell").nth(3)).toHaveText("");

  // The amount leads to the transactions behind it.
  await categoryRow(page, "Salary").getByRole("link", { name: "€2,850.00" }).click();
  await expect(page).toHaveURL(/\/transactions\?show=all&category=\d+&month=2026-11$/);
  const picked = page.getByRole("combobox", { name: "Category", exact: true });
  await expect(picked.locator("option:checked")).toHaveText("Salary");
  await expect(
    page.getByText("1 transaction matches. Money in €2,850.00, money out €0.00."),
  ).toBeVisible();

  // Another month has nothing received.
  await page.goto("/?month=2026-10");
  await expect(available(page, "Salary")).toHaveText("€0.00");
  await expect(categoryRow(page, "Salary").getByRole("link")).toHaveCount(0);
  await expect(groupTotal(page, "Income")).toHaveText("€0.00 received");
});

test("the picker offers the income categories first, and No category is then for transfers", async ({
  page,
}) => {
  await importBankFile(page);
  await page.goto("/");
  await addIncomeCategories(page, ["Salary"]);

  await page.goto("/transactions");
  const picker = salaryPicker(page);
  await picker.focus();
  await expect(picker.locator("optgroup")).toHaveCount(2);
  await expect(picker.locator("optgroup").first()).toHaveAttribute("label", "Income");
  await expect(picker.locator("optgroup").first().locator("option")).toHaveText(["Salary"]);
  await expect(picker.locator("option").nth(1)).toHaveText("No category (transfer)");
  await picker.selectOption({ label: "Salary" });
  await expect(headerFigure(page)).toHaveText("5");

  // The next salary is suggested into the same category.
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles({
    name: "bonus.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"',
        '"20261120";"Acme Corp";"NL01BANK0123456789";"NL02BANK0987654321";"OV";"Bij";"500,00";"Overschrijving";"Bonus November";"2.454,90";""',
      ].join("\n"),
    ),
  });
  await page.getByRole("button", { name: "Import 1 transaction into Checking" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported 1 transaction into Checking." }),
  ).toBeVisible();
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await page
    .getByRole("button", { name: "Sort Acme Corp on Nov 20, 2026 into Salary, as last time" })
    .click();
  await expect(headerFigure(page)).toHaveText("5");
  await page.goto("/?month=2026-11");
  await expect(available(page, "Salary")).toHaveText("€3,350.00");

  // Without income categories, No category is for income again.
  await archive(page, "Salary");
  await page.goto("/transactions?show=all");
  await expect(salaryPicker(page).locator("option").nth(1)).toHaveText(
    "No category (income or transfer)",
  );
});

test("an income category is renamed, moved and archived from its menu, and comes back as income", async ({
  page,
}) => {
  await addIncomeCategories(page, ["Salary", "Benefits"]);
  // Names are shared with the expense categories.
  await newIncomeField(page).fill("groceries");
  await newIncomeField(page).press("Enter");
  await expect(alert(page, 'You already have a category called "groceries".')).toBeVisible();
  await newIncomeField(page).press("Escape");
  await clickAway(page);
  // With income categories, the field waits behind the heading's "+".
  await expect(newIncomeField(page)).toHaveCount(0);

  // Only what fits a category that holds no money and has no group.
  await openMenu(page, "Salary");
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    "Rename",
    "Move up",
    "Move down",
    "Archive",
  ]);
  await expect(menuItem(page, "Move up")).toHaveAttribute("aria-disabled", "true");
  await menuItem(page, "Move down").click();
  await expect.poll(() => incomeNames(page)).toEqual(["Benefits", "Salary"]);

  await openMenu(page, "Benefits");
  await menuItem(page, "Rename").click();
  await page.keyboard.type("Child benefit");
  await page.keyboard.press("Enter");
  await expect.poll(() => incomeNames(page)).toEqual(["Child benefit", "Salary"]);

  const ready = await headerFigure(page).innerText();
  expect(await archive(page, "Salary")).toBe('Archive "Salary"?');
  await expect(headerFigure(page)).toHaveText(ready);
  await page.getByRole("button", { name: "Show" }).click();
  const archived = page
    .getByRole("list", { name: "Archived categories" })
    .getByRole("listitem")
    .filter({ hasText: "Salary" });
  // It holds nothing, so restoring takes nothing out of Ready to assign.
  await expect(archived).toContainText("Income");
  await expect(archived).not.toContainText(/€|Restoring/);

  await page.getByRole("button", { name: "Restore Salary" }).click();
  await expect.poll(() => incomeNames(page)).toEqual(["Child benefit", "Salary"]);
  await expect(headerFigure(page)).toHaveText(ready);
});

test("an expense category cannot be moved into Income or get money from an income category", async ({
  page,
}) => {
  await addIncomeCategories(page, ["Salary"]);
  await openMenu(page, "Groceries");
  await expect(menuItem(page, "Move to Income")).toHaveCount(0);
  await menuItem(page, "Move money…").click();
  const picker = page.getByRole("combobox", { name: "Move to" });
  await expect(picker.locator("option")).toHaveText(["Ready to assign (€1,000.00)"]);
});

test.describe("on the demo data", () => {
  test.use({ app: { seed: true } });

  test("the salary shows under Income, and in the line under the month", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => incomeNames(page)).toEqual(["Salary"]);
    await expect(available(page, "Salary")).toHaveText("€2,850.00");
    await expect(spentLine(page)).toContainText(/^€2,850 received · €[\d,]+ spent of /);
  });
});
