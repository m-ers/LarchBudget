import type { Page } from "@playwright/test";
import {
  addCategories,
  alert,
  categoriesIn,
  category,
  clickAway,
  groupNames,
  headerFigure,
  menuItem,
  openGroupMenu,
  openMenu,
} from "./helpers";
import { expect, test } from "./fixtures";

// Getting an archived category back.

test.use({ app: { seed: true } });

/** Agrees to the next question. */
const agree = (page: Page) => page.once("dialog", (dialog) => void dialog.accept());

async function archive(page: Page, name: string) {
  agree(page);
  await openMenu(page, name);
  await menuItem(page, "Archive").click();
  await expect(category(page, name)).toHaveCount(0);
}

const archivedLine = (page: Page) => page.getByText(/archived categor(y|ies) ·/);
const archivedList = (page: Page) => page.getByRole("list", { name: "Archived categories" });

/** "€2,857.65" as cents. */
const cents = (money: string) => Math.round(Number(money.replace(/[^0-9.-]/g, "")) * 100);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(category(page, "Groceries")).toBeVisible();
});

test("an archived category comes back in its group, with its money", async ({ page }) => {
  // Nothing is archived yet, so nothing is said about it.
  await expect(archivedLine(page)).toHaveCount(0);
  const before = cents(await headerFigure(page).innerText());
  await archive(page, "Holiday");
  await archive(page, "Groceries");
  const afterArchiving = cents(await headerFigure(page).innerText());
  const held = afterArchiving - before;
  expect(held).toBeGreaterThan(0);

  await expect(archivedLine(page)).toHaveText("2 archived categories · Show");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });
  const holiday = archivedList(page).getByRole("listitem").filter({ hasText: "Holiday" });
  await expect(holiday).toContainText("Restoring takes €750.00 out of Ready to assign.");
  await expect(archivedList(page).getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Restore Groceries" }).click();
  await expect.poll(() => categoriesIn(page, "Everyday")).toEqual(["Eating out", "Groceries"]);
  await expect(headerFigure(page)).toHaveText(money.format((afterArchiving - held + 75_000) / 100));
  await expect(archivedLine(page)).toHaveText("1 archived category · Hide");

  await page.getByRole("button", { name: "Restore Holiday" }).click();
  await expect.poll(() => categoriesIn(page, "Goals")).toEqual(["Emergency fund", "Holiday"]);
  await expect(headerFigure(page)).toHaveText(money.format(before / 100));
  await expect(archivedLine(page)).toHaveCount(0);
});

test("a category is not restored while another has its name", async ({ page }) => {
  await archive(page, "Rent");
  await addCategories(page, "Fixed costs", ["rent"]);
  await clickAway(page);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Restore Rent" }).click();
  await expect(
    alert(page, "Another category already has this name. Rename that one first."),
  ).toBeVisible();
  await expect(category(page, "Rent")).toHaveCount(0);
});

test("a category of a deleted group comes back in the first group", async ({ page }) => {
  agree(page);
  await openGroupMenu(page, "Goals");
  await menuItem(page, "Delete group").click();
  await expect.poll(() => groupNames(page)).toEqual(["Fixed costs", "Everyday"]);

  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Restore Holiday" }).click();
  await expect
    .poll(() => categoriesIn(page, "Fixed costs"))
    .toEqual(["Rent", "Utilities", "Transport", "Holiday"]);
});
