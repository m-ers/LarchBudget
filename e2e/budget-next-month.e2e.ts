import {
  addAccount,
  addCategories,
  addGroup,
  assign,
  assignAndSave,
  assignedField,
  headerFigure,
} from "./budget-page";
import { expect, test } from "./fixtures";

// Starting a month with what was assigned the month before.

/** The name of the month `offset` months from now, e.g. "December". */
function monthName(offset: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleString("en-US", {
    month: "long",
  });
}

test.beforeEach(async ({ page }) => {
  await addAccount(page, "Main account", "5000");
  await page.goto("/");
  await addGroup(page, "Fixed costs");
  await addCategories(page, "Fixed costs", ["Rent", "Water", "Fun"]);
  await assignAndSave(page, "Rent", "1100");
  await assignAndSave(page, "Water", "95");
});

test("a new month can start with what each category got last month", async ({ page }) => {
  // Nothing was assigned the month before this one, so nothing is offered.
  await expect(page.getByText(/^Nothing assigned in/)).toHaveCount(0);

  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByText(`Nothing assigned in ${monthName(1)} yet.`)).toBeVisible();
  await page.getByRole("button", { name: `Assign the same as ${monthName(0)}` }).click();

  await expect(assignedField(page, "Rent")).toHaveValue("1,100.00");
  await expect(assignedField(page, "Water")).toHaveValue("95.00");
  await expect(assignedField(page, "Fun")).toHaveValue("");
  await expect(headerFigure(page)).toHaveText("€2,610.00");
  await expect(page.getByText(/^Nothing assigned in/)).toHaveCount(0);
});

test("the offer goes once something is assigned in the month", async ({ page }) => {
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByText(/^Nothing assigned in/)).toBeVisible();
  await assign(page, "Fun", "10");
  await expect(page.getByText(/^Nothing assigned in/)).toHaveCount(0);
});
