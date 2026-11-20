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
  category,
  categoryRow,
  groupHeading,
  groupRow,
  groupTotal,
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
  await expect(groupTotal(page, "Fixed costs")).toHaveText("€1,195.00");

  await assign(page, "Groceries", "2000");
  await expect(headerFigure(page)).toHaveText("-€695.00");
  await expect(page.getByText("Assigned more than you have")).toBeVisible();

  await assign(page, "Groceries", "1305");
  await expect(headerFigure(page)).toHaveText("€0.00");
  await expect(page.getByText("Every cent is assigned")).toBeVisible();
});

test("a group's heading adds up what its categories got and spent, and what they hold", async ({
  page,
}) => {
  await addAccount(page, "Main account", "2500");
  await page.goto("/");
  await addGroup(page, "Fixed costs");
  await addCategories(page, "Fixed costs", ["Rent", "Utilities"]);
  await expect(groupRow(page, "Fixed costs").getByRole("cell")).toHaveText(["0.00", "–", "€0.00"]);

  await assign(page, "Rent", "1100");
  await assign(page, "Utilities", "95");
  await expect(groupRow(page, "Fixed costs").getByRole("cell")).toHaveText([
    "1,195.00",
    "–",
    "€1,195.00",
  ]);
});

test.describe("with transactions", () => {
  test.use({ app: { seed: true } });

  test("a group's Spent is what its categories spent together", async ({ page }) => {
    await page.goto("/");
    // Read from the page: what the demo data holds depends on the day of the month.
    const cents = (spent: string) =>
      spent === "–" ? 0 : Math.round(Number(spent.replace(/[^0-9.]/g, "")) * 100);
    const spentIn = async (name: string) =>
      cents(await categoryRow(page, name).getByRole("cell").nth(3).innerText());

    const together = (await spentIn("Groceries")) + (await spentIn("Eating out"));
    expect(together).toBeGreaterThan(0);
    const groupSpent = await groupRow(page, "Everyday").getByRole("cell").nth(1).innerText();
    expect(cents(groupSpent)).toBe(together);
  });
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
  await assignAndSave(page, "Rent", "400");
  await expect(available(page, "Rent")).toHaveText("€400.00");

  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByRole("link", { name: "This month" })).toBeVisible();
  await expect(assignedField(page, "Rent")).toHaveValue("");
  await expect(available(page, "Rent")).toHaveText("€400.00");
  await expect(headerFigure(page)).toHaveText("€600.00");

  await page.getByRole("link", { name: "This month" }).click();
  await expect(assignedField(page, "Rent")).toHaveValue("400.00");
});

test("the Available amount explains how it adds up", async ({ page }) => {
  await addAccount(page, "Main account", "1000");
  await page.goto("/");
  await addGroup(page, "Fixed costs");
  await addCategories(page, "Fixed costs", ["Rent", "Repairs"]);
  const explanation = (name: string) => available(page, name).locator("[title]");
  await expect(explanation("Rent")).toHaveAttribute(
    "title",
    "Nothing assigned or spent this month.",
  );
  await assignAndSave(page, "Rent", "400");
  await assignAndSave(page, "Repairs", "-250");
  await expect(explanation("Rent")).toHaveAttribute("title", "€400.00 assigned");

  await page.getByRole("link", { name: "Next month" }).click();
  await assign(page, "Rent", "100");
  await expect(explanation("Rent")).toHaveAttribute(
    "title",
    "€400.00 from earlier months + €100.00 assigned",
  );
  await expect(explanation("Repairs")).toHaveAttribute(
    "title",
    "Overspent by €250.00: assign more to cover it. -€250.00 from earlier months",
  );
  // Screen readers hear it too.
  await expect(available(page, "Repairs")).toHaveText("Overspent: -€250.00");
});

/** Archives a category, agreeing to the question, and returns the question. */
async function archive(page: Page, name: string): Promise<string> {
  const question = new Promise<string>((resolve) =>
    page.once("dialog", (dialog) => {
      resolve(dialog.message());
      void dialog.accept();
    }),
  );
  await categoryRow(page, name).hover();
  await page.getByRole("button", { name: `Archive ${name}` }).click();
  await expect(category(page, name)).toHaveCount(0);
  return question;
}

test("archiving a category gives all its money back to Ready to assign", async ({ page }) => {
  await addAccount(page, "Main account", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", ["Groceries", "Eating out"]);
  await page.getByRole("link", { name: "Next month" }).click();
  await assignAndSave(page, "Groceries", "200");
  await page.getByRole("link", { name: "This month" }).click();
  await assign(page, "Groceries", "300");
  await expect(headerFigure(page)).toHaveText("€500.00");

  // Viewing this month, the question still names what next month holds too.
  expect(await archive(page, "Groceries")).toBe(
    'Archive "Groceries"? Its €500.00 goes back to Ready to assign.',
  );
  await expect(headerFigure(page)).toHaveText("€1,000.00");
  await expect(category(page, "Eating out")).toBeVisible();
});

test("archiving an overspent category says what it takes from Ready to assign", async ({
  page,
}) => {
  await addAccount(page, "Main account", "1000");
  await page.goto("/");
  await addGroup(page, "Fixed costs");
  await addCategories(page, "Fixed costs", ["Repairs", "Water"]);
  await assign(page, "Repairs", "-250");
  await expect(headerFigure(page)).toHaveText("€1,250.00");

  expect(await archive(page, "Repairs")).toBe(
    'Archive "Repairs"? It is overspent by €250.00, which then comes out of Ready to assign.',
  );
  await expect(headerFigure(page)).toHaveText("€1,000.00");
  expect(await archive(page, "Water")).toBe('Archive "Water"?');
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

test.describe("a budget longer than the window", () => {
  test.use({ app: { seed: true }, viewport: { width: 1280, height: 400 } });

  test("keeps the column headings in view, above the field being edited", async ({ page }) => {
    await page.goto("/");
    await assignedField(page, "Emergency fund").click();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const heading = page.getByRole("columnheader", { name: "Assigned" });
    await expect(heading).toBeInViewport();

    for (const name of ["Holiday", "Eating out", "Groceries", "Transport", "Utilities", "Rent"]) {
      await page.keyboard.press("ArrowUp");
      await expect(assignedField(page, name)).toBeFocused();
      await expect(heading).toBeInViewport();
      const field = (await assignedField(page, name).boundingBox())!;
      const head = (await heading.boundingBox())!;
      expect(field.y).toBeGreaterThanOrEqual(head.y + head.height);
    }
  });
});
