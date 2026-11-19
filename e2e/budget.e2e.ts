import {
  addAccount,
  addCategories,
  addGroup,
  alert,
  assign,
  assignedField,
  available,
  category,
  categoryRow,
  groupHeading,
  headerFigure,
  openNewCategory,
} from "./budget-page";
import { expect, test } from "./fixtures";

test("an empty budget shows where to start", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Welcome to LarchBudget.")).toBeVisible();
  await expect(headerFigure(page)).toHaveText("€0.00");
  await expect(page.getByText(/^No categories yet\./)).toBeVisible();

  await page.getByRole("link", { name: "Add an account" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
});

test("an account's balance becomes money to assign", async ({ page }) => {
  await addAccount(page, "Main account", "2500");
  await expect(headerFigure(page)).toHaveText("€2,500.00");

  await page.getByRole("link", { name: "Budget" }).click();
  await expect(headerFigure(page)).toHaveText("€2,500.00");
  await expect(page.getByText("Ready to assign", { exact: true })).toBeVisible();
});

test("money is divided over categories, and over-assigning is flagged", async ({ page }) => {
  await addAccount(page, "Main account", "2500");
  await page.goto("/");
  await addGroup(page, "Fixed costs");
  await addCategories(page, "Fixed costs", ["Rent", "Utilities"]);
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries"]);

  // Enter moves to the next amount, also into the next group.
  await assignedField(page, "Rent").click();
  await page.keyboard.type("1100");
  await page.keyboard.press("Enter");
  await page.keyboard.type("95");
  await page.keyboard.press("Enter");
  await expect(assignedField(page, "Groceries")).toBeFocused();
  await page.keyboard.type("350,50");
  await page.keyboard.press("Enter");
  await expect(headerFigure(page)).toHaveText("€954.50");
  await expect(available(page, "Groceries")).toHaveText("€350.50");
  await expect(groupHeading(page, "Fixed costs").locator("xpath=..")).toContainText("€1,195.00");

  await assign(page, "Groceries", "2000");
  await expect(headerFigure(page)).toHaveText("-€695.00");
  await expect(page.getByText("Assigned more than you have")).toBeVisible();

  await assign(page, "Groceries", "1305");
  await expect(headerFigure(page)).toHaveText("€0.00");
  await expect(page.getByText("Every cent is assigned")).toBeVisible();
});

test("something that is not an amount is refused, and Escape clears it", async ({ page }) => {
  await addAccount(page, "Main account", "100");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries"]);

  await assignedField(page, "Groceries").click();
  await page.keyboard.type("abc");
  await page.keyboard.press("Enter");
  await expect(alert(page, "That is not an amount.")).toBeVisible();

  await assignedField(page, "Groceries").click();
  await page.keyboard.press("Escape");
  await expect(alert(page, "That is not an amount.")).toHaveCount(0);
  await expect(headerFigure(page)).toHaveText("€100.00");
});

test("leftovers roll over into the next month", async ({ page }) => {
  await addAccount(page, "Main account", "1000");
  await page.goto("/");
  await addGroup(page, "Fixed costs");
  await addCategories(page, "Fixed costs", ["Rent"]);
  await assign(page, "Rent", "400");
  await expect(available(page, "Rent")).toHaveText("€400.00");

  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByRole("link", { name: "This month" })).toBeVisible();
  await expect(assignedField(page, "Rent")).toHaveValue("");
  await expect(available(page, "Rent")).toHaveText("€400.00");
  await expect(headerFigure(page)).toHaveText("€600.00");

  await page.getByRole("link", { name: "This month" }).click();
  await expect(assignedField(page, "Rent")).toHaveValue("400.00");
});

test("archiving a category gives its money back to Ready to assign", async ({ page }) => {
  await addAccount(page, "Main account", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries", "Eating out"]);
  await assign(page, "Groceries", "300");
  await expect(headerFigure(page)).toHaveText("€700.00");

  let question = "";
  page.once("dialog", (dialog) => {
    question = dialog.message();
    void dialog.accept();
  });
  await categoryRow(page, "Groceries").hover();
  await page.getByRole("button", { name: "Archive Groceries" }).click();
  await expect(category(page, "Groceries")).toHaveCount(0);
  expect(question).toBe(
    'Archive "Groceries"? Its balance of €300.00 goes back to Ready to assign.',
  );
  await expect(headerFigure(page)).toHaveText("€1,000.00");
  await expect(category(page, "Eating out")).toBeVisible();
});

test("groups and categories are renamed in place", async ({ page }) => {
  await page.goto("/");
  await addGroup(page, "Temp");
  await addCategories(page, "Temp", ["Utilities"]);

  await page.getByRole("button", { name: "Temp", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Fixed costs");
  await page.keyboard.press("Enter");
  await expect(groupHeading(page, "Fixed costs")).toBeVisible();

  await category(page, "Utilities").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Energy");
  await page.keyboard.press("Enter");
  await expect(category(page, "Energy")).toBeVisible();
  await expect(category(page, "Utilities")).toHaveCount(0);
});

test("names are unique, ignoring case", async ({ page }) => {
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Rent"]);

  const groupField = page.getByRole("textbox", { name: "New group name" });
  await groupField.fill("everyday");
  await groupField.press("Enter");
  await expect(alert(page, 'You already have a group called "everyday".')).toBeVisible();

  await openNewCategory(page, "Everyday");
  await page.keyboard.type("RENT");
  await page.keyboard.press("Enter");
  await expect(alert(page, 'You already have a category called "RENT".')).toBeVisible();
});

test("a rename started again after Escape is saved", async ({ page }) => {
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries"]);

  await category(page, "Groceries").click();
  await page.keyboard.press("Escape");
  await category(page, "Groceries").click();
  await page.keyboard.type("Food");
  await page.keyboard.press("Enter");
  await expect(category(page, "Food")).toBeVisible();
});

test("a save while LarchBudget cannot be reached says so, and keeps what was typed", async ({
  page,
  server,
}) => {
  await addAccount(page, "Main account", "100");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries"]);

  await server.stop();
  await assign(page, "Groceries", "123");
  await expect(
    alert(page, "Could not reach LarchBudget. Check your connection and try again."),
  ).toBeVisible();
  await expect(assignedField(page, "Groceries")).toHaveValue("123");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
