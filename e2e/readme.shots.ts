import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { menuItem, openMenu } from "./helpers";

/**
 * Takes the pictures shown in the README and in `docs/`, from the demo data
 * (`npm run db:seed`). Run `npm run build` and then `npm run screenshots`;
 * the pictures land in `docs/images`. The demo data follows today's date,
 * so the pictures change a little every time: take them again for a release,
 * or when a screen has changed.
 */
test.use({ app: { seed: true } });

async function takePicture(page: Page, name: string) {
  // Nothing should look hovered, or halfway a fade.
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/images/${name}.png`, animations: "disabled" });
}

/** A day a few days back, as banks write it: 2026-11-18. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A file as a bank would offer it, with payees the demo data has seen before. */
const bankFile = () =>
  [
    "Date,Name,Description,Amount",
    `${daysAgo(0)},Fresh Market,Card payment,-52.18`,
    `${daysAgo(1)},City Transit,Monthly pass,-49.00`,
    `${daysAgo(2)},Corner Bistro,Card payment,-27.50`,
    `${daysAgo(3)},Power & Water Co,Advance payment,-92.00`,
    `${daysAgo(5)},Flower Stall,Card payment,-12.00`,
    `${daysAgo(6)},Fresh Market,Card payment,-38.40`,
  ].join("\n");

test("the budget", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 790 });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Assigned to Groceries" })).toBeVisible();
  await takePicture(page, "budget");
});

test("a category's menu, and moving money", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 830 });
  await page.goto("/");
  await openMenu(page, "Groceries");
  await page.screenshot({ path: "docs/images/menu.png", animations: "disabled" });

  await menuItem(page, "Move money…").click();
  await page.getByRole("textbox", { name: "Amount to move" }).fill("40.00");
  const target = page.getByRole("combobox", { name: "Move to" });
  const holiday = await target.locator("option", { hasText: /^Holiday \(/ }).getAttribute("value");
  await target.selectOption(holiday);
  await takePicture(page, "move-money");
});

test("importing a bank file, and sorting what came in", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/");
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles({
    name: "transactions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(bankFile()),
  });
  const importButton = page.getByRole("button", { name: /^Import 6 transactions into/ });
  await expect(importButton).toBeVisible();
  await takePicture(page, "import");

  await importButton.click();
  await expect(page.getByRole("heading", { name: /^Imported 6 transactions into/ })).toBeVisible();
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(page.getByRole("combobox", { name: /^Category for Flower Stall/ })).toBeVisible();
  await takePicture(page, "transactions");
});

test("accounts", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 740 });
  await page.goto("/accounts");
  await expect(page.getByRole("button", { name: "Add account" })).toBeVisible();
  await takePicture(page, "accounts");
});
