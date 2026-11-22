import type { Page } from "@playwright/test";
import {
  addAccount,
  addCategories,
  addGroup,
  alert,
  available,
  bankFile,
  chosen,
  headerFigure,
} from "./helpers";
import { expect, test } from "./fixtures";

/** One account, a few categories, and six imported transactions to sort. */
test.beforeEach(async ({ page }) => {
  await addAccount(page, "Checking", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries", "Household", "Coffee"]);

  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(bankFile("ing.csv"));
  await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported 6 transactions into Checking." }),
  ).toBeVisible();
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(headerFigure(page)).toHaveText("6");
});

const addForm = (page: Page) => page.getByRole("form", { name: "Add a transaction" });

/** Opens the form under a transaction with the pencil that shows on hovering its row. */
async function openEdit(page: Page, payee: string) {
  const row = page.getByRole("row").filter({ hasText: payee }).first();
  await row.hover();
  await row.getByRole("button", { name: new RegExp(`^Change ${payee} on `) }).click();
  const form = page.getByRole("form", { name: `Change ${payee}` });
  await expect(form).toBeVisible();
  return form;
}

/** Adds "Market stall", 64.20 out, split 51.70 Groceries and 12.50 Household. */
async function addSplit(page: Page) {
  await page.getByRole("button", { name: "Add transaction" }).click();
  const form = addForm(page);
  await form.getByLabel("Payee").fill("Market stall");
  await form.getByLabel("Amount", { exact: true }).fill("64.20");
  await form.getByRole("button", { name: "Split" }).click();
  await form.getByLabel("Category of part 1").selectOption({ label: "Groceries" });
  await form.getByLabel("Category of part 2").selectOption({ label: "Household" });
  await form.getByLabel("Amount of part 2").fill("12.50");
  // The first part takes what the others leave.
  await expect(form.getByLabel("Amount of part 1")).toHaveValue("51.70");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form).toBeHidden();
}

test("adds a split payment by hand, and counts each part in its own category", async ({ page }) => {
  await addSplit(page);

  // Added from the To sort list, it is found in the All list.
  await expect(page).toHaveURL(/show=all/);
  const row = page.getByRole("row").filter({ hasText: "Market stall" });
  await expect(row).toContainText("Split");
  await expect(row).toContainText("-64.20");
  await expect(page.getByRole("row").filter({ hasText: /^Groceries-51\.70$/ })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: /^Household-12\.50$/ })).toBeVisible();
  // It was sorted while it was added.
  await expect(headerFigure(page)).toHaveText("6");

  await page.getByRole("link", { name: "Budget" }).click();
  await expect(available(page, "Groceries")).toHaveText(/51\.70$/);
  await expect(available(page, "Household")).toHaveText(/12\.50$/);
});

test("a part takes the remaining amount with one press", async ({ page }) => {
  await page.getByRole("button", { name: "Add transaction" }).click();
  const form = addForm(page);
  await form.getByLabel("Payee").fill("Market stall");
  await form.getByLabel("Amount", { exact: true }).fill("64.20");
  // The split button is an icon: its name is its tip.
  await form.getByRole("button", { name: "Split over categories" }).click();
  await form.getByLabel("Category of part 1").selectOption({ label: "Groceries" });
  await form.getByLabel("Category of part 2").selectOption({ label: "Household" });
  await form.getByLabel("Amount of part 1").fill("50");
  await expect(form.getByText("€14.20 left to split")).toBeVisible();

  // Nothing to take for a part that already has what the others leave.
  await expect(form.getByRole("button", { name: /^Part 1 takes/ })).toBeVisible();
  const take = form.getByRole("button", { name: "Part 2 takes the remaining €14.20" });
  await take.click();
  await expect(form.getByLabel("Amount of part 2")).toHaveValue("14.20");
  await expect(form.getByLabel("Amount of part 2")).toBeFocused();
  await expect(form.getByText("left to split")).toHaveCount(0);
  await expect(form.getByRole("button", { name: /takes the remaining/ })).toHaveCount(0);

  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: /^Household-14\.20$/ })).toBeVisible();
});

test("narrowed to a category, a split counts with its part in that category", async ({ page }) => {
  await addSplit(page);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Household" });
  await expect(page.getByText(/transaction matches/)).toHaveText(
    "1 transaction matches. Money in €0.00, money out €12.50.",
  );
  await expect(page.getByRole("row").filter({ hasText: "Market stall" })).toBeVisible();
});

test("does not add a split whose parts do not add up", async ({ page }) => {
  await page.getByRole("button", { name: "Add transaction" }).click();
  const form = addForm(page);
  await form.getByLabel("Payee").fill("Market stall");
  await form.getByLabel("Amount", { exact: true }).fill("64.20");
  await form.getByRole("button", { name: "Split" }).click();
  await form.getByLabel("Category of part 1").selectOption({ label: "Groceries" });
  await form.getByLabel("Category of part 2").selectOption({ label: "Household" });
  await form.getByLabel("Amount of part 1").fill("50");
  await form.getByLabel("Amount of part 2").fill("10");
  await expect(form.getByText("€4.20 left to split")).toBeVisible();

  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(alert(page, "The parts have to add up to the amount.")).toBeVisible();
  await expect(form).toBeVisible();

  // Taking a part away makes it whole again, in the category that part had.
  await form.getByRole("button", { name: "Remove part 2" }).click();
  await expect(chosen(form.getByLabel("Category", { exact: true }))).toHaveText("Groceries");
});

test("changes the payee, note and category of an imported transaction, never its date or amount", async ({
  page,
}) => {
  const form = await openEdit(page, "Fresh Market");
  // The date and amount are shown, without fields.
  await expect(form.getByLabel("Date")).toHaveCount(0);
  await expect(form.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await expect(form).toContainText("-€45.10");
  // It stays in the account of its bank file.
  await expect(form.getByLabel("Account")).toHaveCount(0);

  await form.getByLabel("Payee").fill("Fresh Market Centre");
  await form.getByLabel("Note").fill("Weekly shop");
  await form.getByLabel("Category", { exact: true }).selectOption({ label: "Groceries" });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();

  // Sorted, so it left the To sort list.
  await expect(headerFigure(page)).toHaveText("5");
  await page.getByRole("link", { name: /^All/ }).click();
  const row = page.getByRole("row").filter({ hasText: "Fresh Market Centre" });
  await expect(row).toContainText("Weekly shop");
  await expect(row).toContainText("-45.10");
});

test("saving a transaction that leaves the To sort list moves the focus to the next one", async ({
  page,
}) => {
  const form = await openEdit(page, "Fresh Market");
  await form.getByLabel("Category", { exact: true }).selectOption({ label: "Groceries" });
  await form.getByLabel("Payee").focus();
  await page.keyboard.press("Enter");
  await expect(form).toBeHidden();
  await expect(headerFigure(page)).toHaveText("5");

  const next = page.getByRole("combobox", { name: /^Category for / }).first();
  await expect(next).toHaveAccessibleName(/^Category for Coffee Bar /);
  await expect(next).toBeFocused();
});

test("changes everything of a transaction added by hand", async ({ page }) => {
  await addAccount(page, "Cash", "50");
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  const add = addForm(page);
  await add.getByLabel("Date").fill("2026-11-10");
  await add.getByLabel("Payee").fill("Car boot sale");
  await add.getByLabel("Amount", { exact: true }).fill("10");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  // Without a category, it waits in the To sort list.
  await expect(headerFigure(page)).toHaveText("7");

  const form = await openEdit(page, "Car boot sale");
  await form.getByLabel("Date").fill("2026-11-12");
  // The choice is the label; the radio button itself is hidden.
  await form.getByText("In", { exact: true }).click();
  await expect(form.getByRole("radio", { name: "In" })).toBeChecked();
  await form.getByLabel("Amount", { exact: true }).fill("12.50");
  await form.getByLabel("Category", { exact: true }).selectOption({ label: "Household" });
  await form.getByLabel("Account").selectOption({ label: "Cash" });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(headerFigure(page)).toHaveText("6");

  await page.getByRole("link", { name: /^All/ }).click();
  const row = page.getByRole("row").filter({ hasText: "Car boot sale" });
  await expect(row).toContainText("Nov 12, 2026");
  await expect(row).toContainText("Cash");
  await expect(row).toContainText("+12.50");
});
