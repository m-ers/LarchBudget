import type { Page } from "@playwright/test";
import { addAccount, addCategories, addGroup, bankFile, headerFigure } from "./helpers";
import { expect, test } from "./fixtures";

/** One account and three categories, nothing imported yet. */
test.beforeEach(async ({ page }) => {
  await addAccount(page, "Checking", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries", "Household", "Coffee"]);
});

async function importBankFile(page: Page) {
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(bankFile("ing.csv"));
  await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
}

async function openRules(page: Page) {
  await page.getByRole("link", { name: "Rules" }).click();
  await expect(page.getByRole("heading", { name: "Rules", level: 1 })).toBeVisible();
}

/** Fills in the form that adds a rule on the Rules page, and adds it. */
async function addRule(page: Page, text: string, category: string) {
  const form = page.getByRole("form", { name: "Add a rule" });
  await form.getByLabel("Payee or note contains").fill(text);
  await form.getByLabel("Category").selectOption({ label: category });
  await form.getByRole("button", { name: "Add rule" }).click();
}

/** A rule's row in the table of the Rules page. */
const rule = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

/** The category a transaction's row shows as chosen. */
const categoryOf = (row: ReturnType<Page["getByRole"]>) =>
  row.getByRole("combobox").locator("option:checked");

test("a rule sorts what comes in with the next import, and says so", async ({ page }) => {
  await openRules(page);
  await expect(page.getByText("No rules yet.")).toBeVisible();
  await addRule(page, "coffee BAR", "Coffee");
  await expect(rule(page, "coffee BAR")).toContainText("Coffee");

  await importBankFile(page);
  await expect(
    page.getByRole("heading", { name: "Imported 6 transactions into Checking." }),
  ).toBeVisible();
  await expect(page.getByText("2 were sorted by your rules; 4 to sort.")).toBeVisible();

  await page.getByRole("link", { name: "Sort them now" }).click();
  await expect(headerFigure(page)).toHaveText("4");
  await expect(page.getByRole("row").filter({ hasText: "Coffee Bar" })).toHaveCount(0);

  // The sorted ones are in the list of everything, marked as sorted by the rule.
  await page.getByRole("link", { name: /^All/ }).click();
  const coffee = page.getByRole("row").filter({ hasText: "Coffee Bar" });
  await expect(coffee).toHaveCount(2);
  await expect(categoryOf(coffee.first())).toHaveText("Coffee");
  await expect(
    coffee.first().getByRole("img", { name: "Sorted by the rule coffee BAR" }),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Landlord" }).getByRole("img")).toHaveCount(
    0,
  );

  await openRules(page);
  await expect(rule(page, "coffee BAR")).toContainText("2");
});

test("a rule can be made from a transaction, with one click on its row", async ({ page }) => {
  await importBankFile(page);
  await expect(page.getByText("Imported 6 transactions into Checking.")).toBeVisible();
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(headerFigure(page)).toHaveText("6");

  // From the To sort list: the words come from the payee, the category is chosen in the form.
  const row = page.getByRole("row").filter({ hasText: "Coffee Bar" }).first();
  await row.hover();
  await row.getByRole("button", { name: /^Always sort like Coffee Bar on / }).click();
  const form = page.getByRole("form", { name: "Make a rule from this transaction" });
  await expect(form.getByLabel("Payee or note contains")).toHaveValue("Coffee Bar");
  await form.getByLabel("Category").selectOption({ label: "Coffee" });
  await form.getByRole("button", { name: "Add rule" }).click();

  // Both coffees are sorted, so four are left.
  await expect(headerFigure(page)).toHaveText("4");
  await expect(page.getByRole("row").filter({ hasText: "Coffee Bar" })).toHaveCount(0);

  // From a row that is sorted already, the form starts with its category.
  await page.getByRole("link", { name: /^All/ }).click();
  const landlord = page.getByRole("row").filter({ hasText: "Landlord" });
  // Like a person: the picker draws its categories once it has the focus.
  await landlord.getByRole("combobox").focus();
  await landlord.getByRole("combobox").selectOption({ label: "Household" });
  await expect(headerFigure(page)).toHaveText("3");
  await landlord.hover();
  await landlord.getByRole("button", { name: /^Always sort like Landlord on / }).click();
  const second = page.getByRole("form", { name: "Make a rule from this transaction" });
  await expect(second.getByLabel("Category").locator("option:checked")).toHaveText("Household");
  await second.getByLabel("Payee or note contains").fill("landlord");
  await second.getByRole("button", { name: "Add rule" }).click();
  await expect(second).toBeHidden();

  await openRules(page);
  await expect(rule(page, "Coffee Bar")).toContainText("2");
  await expect(rule(page, "landlord")).toContainText("Household");
});

test("a rule made on the Rules page sorts what is still to sort, and says how many", async ({
  page,
}) => {
  await importBankFile(page);
  await expect(page.getByText("Imported 6 transactions into Checking.")).toBeVisible();
  await openRules(page);
  await addRule(page, "market", "Groceries");
  await expect(page.getByRole("status").filter({ hasText: "1 transaction sorted." })).toBeVisible();
  await expect(rule(page, "market")).toContainText("Groceries");

  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(headerFigure(page)).toHaveText("5");
});

test("changing a rule moves what it sorted, and deleting it keeps the transactions", async ({
  page,
}) => {
  await openRules(page);
  await addRule(page, "coffee", "Coffee");
  await importBankFile(page);
  await expect(page.getByText("Imported 6 transactions into Checking.")).toBeVisible();

  await openRules(page);
  const coffee = rule(page, "coffee");
  await coffee.hover();
  await coffee.getByRole("button", { name: "Change the rule coffee" }).click();
  const form = page.getByRole("form", { name: "Change the rule coffee" });
  await form.getByLabel("Category").selectOption({ label: "Household" });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(coffee).toContainText("Household");
  await expect(coffee.getByRole("status")).toHaveText("2 transactions sorted.");

  await page.getByRole("link", { name: /^Transactions/ }).click();
  await page.getByRole("link", { name: /^All/ }).click();
  const bars = page.getByRole("row").filter({ hasText: "Coffee Bar" });
  await expect(categoryOf(bars.first())).toHaveText("Household");

  // Deleting the rule keeps them where they are, and the mark goes.
  await openRules(page);
  page.once("dialog", (dialog) => dialog.accept());
  await rule(page, "coffee").hover();
  await rule(page, "coffee").getByRole("button", { name: "Delete the rule coffee" }).click();
  await expect(page.getByText("No rules yet.")).toBeVisible();
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await page.getByRole("link", { name: /^All/ }).click();
  await expect(categoryOf(bars.first())).toHaveText("Household");
  await expect(bars.first().getByRole("img")).toHaveCount(0);
});

test("a rule that cannot be made says why", async ({ page }) => {
  await openRules(page);
  const form = page.getByRole("form", { name: "Add a rule" });
  await form.getByRole("button", { name: "Add rule" }).click();
  await expect(form.getByRole("alert")).toHaveText("Type the words to look for.");

  await form.getByLabel("Payee or note contains").fill("coffee");
  await form.getByRole("button", { name: "Add rule" }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose a category.");

  await form.getByLabel("Category").selectOption({ label: "Coffee" });
  await form.getByRole("button", { name: "Add rule" }).click();
  await expect(rule(page, "coffee")).toBeVisible();

  await form.getByLabel("Payee or note contains").fill("  COFFEE ");
  await form.getByLabel("Category").selectOption({ label: "Household" });
  await form.getByRole("button", { name: "Add rule" }).click();
  await expect(form.getByRole("alert")).toHaveText("You already have a rule for these words.");
});

test("an import that the rules sorted completely can still be undone", async ({ page }) => {
  await openRules(page);
  await addRule(page, "a", "Coffee");
  await expect(rule(page, "Coffee")).toBeVisible();
  await importBankFile(page);
  await expect(page.getByText("All 6 were sorted by your rules.")).toBeVisible();
  await page.getByRole("button", { name: "Undo this import" }).click();
  await expect(page.getByText("Import undone. 6 transactions were removed.")).toBeVisible();
});
