import path from "node:path";
import type { Page } from "@playwright/test";
import {
  addAccount,
  addCategories,
  addGroup,
  alert,
  categoryRow,
  category,
  headerFigure,
  menuItem,
  openMenu,
  windowLosesFocus,
} from "./budget-page";
import { expect, test } from "./fixtures";

/** One account, a few categories, and six imported transactions to sort. */
test.beforeEach(async ({ page }) => {
  await addAccount(page, "Checking", "1000");
  await page.goto("/");
  await addGroup(page, "Everyday");
  await addCategories(page, "Everyday", [
    "Eating out",
    "Emergency fund",
    "Groceries",
    "Coffee",
    "Rent",
    "Utilities",
  ]);

  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(path.join("e2e", "files", "ing.csv"));
  await page.getByRole("button", { name: "Import 6 transactions into Checking" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported 6 transactions into Checking." }),
  ).toBeVisible();

  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(headerFigure(page)).toHaveText("6");
});

const picker = (page: Page, payee: string, date: string) =>
  page.getByRole("combobox", { name: `Category for ${payee} on ${date}` }).first();

const firstPicker = (page: Page) => page.getByRole("combobox", { name: /^Category for / }).first();

const shown = (select: ReturnType<typeof firstPicker>) => select.locator("option:checked");

/** Chooses like a person: the picker gets focus first, which is when it draws its categories. */
async function choose(select: ReturnType<typeof firstPicker>, option: string | { label: string }) {
  await select.focus();
  await select.selectOption(option);
}

/** A bank file in the ING layout, one line per [date, payee, amount in cents (negative = out)]. */
function bankFile(rows: [string, string, number][]) {
  const header =
    '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"';
  const lines = rows.map(([date, payee, cents], i) => {
    const amount = (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
    return `"${date}";"${payee}";"NL01BANK0123456789";"";"BA";"${cents < 0 ? "Af" : "Bij"}";"${amount}";"Betaalautomaat";"Line ${date}-${i}";"0,00";""`;
  });
  return {
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([header, ...lines].join("\n")),
  };
}

async function importFile(page: Page, file: ReturnType<typeof bankFile> | string, count: number) {
  // Through the link, as a person does: a file chosen before the page is ready is lost.
  await page.getByRole("link", { name: "Import from bank" }).click();
  await page.getByLabel("Bank file").setInputFiles(file);
  await page.getByRole("button", { name: `Import ${count} transactions into Checking` }).click();
  await expect(
    page.getByRole("heading", { name: /^(Imported|Nothing new to import)/ }),
  ).toBeVisible();
}

test("picking a category saves at once and moves on to the next", async ({ page }) => {
  await choose(picker(page, "Fresh Market", "Nov 18, 2026"), { label: "Groceries" });
  await expect(headerFigure(page)).toHaveText("5");
  await expect(firstPicker(page)).toBeFocused();
  await expect(page.getByRole("link", { name: /^Transactions.*5 to sort/ })).toBeVisible();

  await choose(picker(page, "Coffee Bar", "Nov 17, 2026"), { label: "Coffee" });
  await expect(headerFigure(page)).toHaveText("4");
  await choose(picker(page, "Coffee Bar", "Nov 17, 2026"), { label: "Coffee" });
  await choose(picker(page, "Power & Water Co", "Nov 15, 2026"), { label: "Utilities" });
  await choose(picker(page, "Landlord", "Nov 2, 2026"), { label: "Rent" });
  await expect(headerFigure(page)).toHaveText("1");
  await choose(picker(page, "Acme Corp", "Nov 1, 2026"), "ready");

  await expect(
    page.getByText("Everything is sorted. New transactions appear here after your next import."),
  ).toBeVisible();
  await expect(page.getByText("Everything is sorted", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Transactions/ })).not.toContainText("to sort");

  await page.getByRole("link", { name: /^All/ }).click();
  await expect(shown(picker(page, "Fresh Market", "Nov 18, 2026"))).toHaveText("Groceries");
  await expect(shown(picker(page, "Acme Corp", "Nov 1, 2026"))).toHaveText(
    "No category (income or transfer)",
  );
  // The account's starting balance is listed, but is not something to sort.
  await expect(page.getByRole("row", { name: /Starting balance/ })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /^Category for Starting balance on / }),
  ).toHaveCount(0);

  // The budget now counts the spending. The bank file is older than the
  // balance entered today, so the account still holds 1,000; all of it is
  // ready to assign, plus the 1,244.10 the categories are overspent by.
  // The bank file is from November 2026, so that is the month to look at.
  await page.goto("/?month=2026-11");
  await expect(categoryRow(page, "Groceries").getByRole("cell").nth(3)).toHaveText("45.10");
  await expect(categoryRow(page, "Groceries").getByRole("cell").last()).toContainText("-€45.10");
  await expect(categoryRow(page, "Rent").getByRole("cell").nth(3)).toHaveText("1,100.00");
  await expect(headerFigure(page)).toHaveText("€2,244.10");
});

// Browsing by typing the first letters, which changes the choice the same way
// on every system (on macOS, ArrowDown opens the list instead).
test("browsing the choices with the keyboard does not save; Enter or leaving does", async ({
  page,
}) => {
  const first = firstPicker(page);
  await first.focus();
  await page.keyboard.type("R");
  await expect(shown(first)).toHaveText("Rent");
  await page.keyboard.press("Escape");
  await expect(shown(first)).toHaveText("Choose a category…");
  await expect(headerFigure(page)).toHaveText("6");

  // Letters typed within a second count as one search, so wait in between.
  await page.waitForTimeout(1500);
  await first.focus();
  await page.keyboard.type("E");
  await expect(shown(first)).toHaveText("Eating out");
  await page.waitForTimeout(1500);
  await page.keyboard.type("Em");
  await expect(shown(first)).toHaveText("Emergency fund");
  await page.waitForTimeout(500);
  await expect(headerFigure(page)).toHaveText("6");

  await page.keyboard.press("Enter");
  await expect(headerFigure(page)).toHaveText("5");
  await expect(firstPicker(page)).toBeFocused();

  await page.keyboard.type("G");
  await expect(shown(firstPicker(page))).toHaveText("Groceries");
  await page.keyboard.press("Tab");
  await expect(headerFigure(page)).toHaveText("4");
});

test("a transaction keeps showing its category after the category is archived", async ({
  page,
}) => {
  await choose(picker(page, "Fresh Market", "Nov 18, 2026"), { label: "Groceries" });
  await expect(headerFigure(page)).toHaveText("5");

  await page.getByRole("link", { name: "Budget" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await openMenu(page, "Groceries");
  await menuItem(page, "Archive").click();
  await expect(category(page, "Groceries")).toHaveCount(0);

  await page.getByRole("link", { name: /^Transactions/ }).click();
  await page.getByRole("link", { name: /^All/ }).click();
  await expect(page).toHaveURL(/show=all/);
  await expect(shown(picker(page, "Fresh Market", "Nov 18, 2026"))).toHaveText(
    "Groceries (archived)",
  );
});

test("an odd limit in the address does not break the page", async ({ page }) => {
  await page.goto("/transactions?limit=200.5");
  await expect(page.getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
  await expect(headerFigure(page)).toHaveText("6");
});

test("the tabs say which one is open", async ({ page }) => {
  await expect(page.getByRole("link", { name: /^To sort/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: /^All/ })).not.toHaveAttribute("aria-current");
  await page.getByRole("link", { name: /^All/ }).click();
  await expect(page.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
});

test("a picker's name includes the amount, and the table header stays in view", async ({
  page,
}) => {
  await expect(
    page.getByRole("combobox", { name: "Category for Coffee Bar on Nov 17, 2026, -3.50" }),
  ).toHaveCount(2);
  await expect(page.getByRole("columnheader", { name: "Date" })).toHaveCSS("position", "sticky");
});

test.describe("on a slow connection", () => {
  test.beforeEach(async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 1000,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  });

  test("focus moves on before the server answers, and rows do not wait for each other", async ({
    page,
  }) => {
    const market = picker(page, "Fresh Market", "Nov 18, 2026");
    const coffee = picker(page, "Coffee Bar", "Nov 17, 2026");
    await choose(market, { label: "Groceries" });
    // Nothing has come back yet: the count is old, but the row shows the choice.
    await expect(headerFigure(page)).toHaveText("6");
    await expect(shown(market)).toHaveText("Groceries");
    await expect(coffee).toBeFocused();

    // A second row is sorted while the first is still on its way.
    await choose(coffee, { label: "Coffee" });
    await expect(headerFigure(page)).toHaveText("6");
    await expect(headerFigure(page)).toHaveText("4", { timeout: 15_000 });
    await expect(picker(page, "Fresh Market", "Nov 18, 2026")).toHaveCount(0);
  });

  test("an error appears on the row that failed, while focus has moved on", async ({
    page,
    context,
  }) => {
    const other = await context.newPage();
    await other.goto("/");
    other.once("dialog", (dialog) => void dialog.accept());
    await openMenu(other, "Groceries");
    await menuItem(other, "Archive").click();
    await expect(category(other, "Groceries")).toHaveCount(0);

    // This page still offers Groceries.
    const market = picker(page, "Fresh Market", "Nov 18, 2026");
    await choose(market, { label: "Groceries" });
    await expect(picker(page, "Coffee Bar", "Nov 17, 2026")).toBeFocused();
    await expect(page.getByRole("row", { name: /Fresh Market/ }).getByRole("alert")).toHaveText(
      "That category no longer exists.",
      { timeout: 15_000 },
    );
    await expect(shown(market)).toHaveText("Choose a category…");
    await expect(headerFigure(page)).toHaveText("6");
  });
});

test("a picker draws the categories when it is first used, complete on the first click", async ({
  page,
}) => {
  const first = firstPicker(page);
  await expect(first.locator("option")).toHaveCount(2);

  // The press of the mouse button is when the browser opens its list.
  await first.hover();
  await page.mouse.down();
  await expect(first.locator("option")).toHaveCount(2 + 6);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(first.locator("option")).toHaveCount(2);

  // Tabbing in is enough to type the first letters of a category.
  await page.getByRole("link", { name: /^All/ }).focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.type("R");
  await expect(shown(first)).toHaveText("Rent");
});

test("a choice browsed with the keyboard is not saved when the window loses focus", async ({
  page,
}) => {
  const first = firstPicker(page);
  await first.focus();
  await page.keyboard.type("R");
  await expect(shown(first)).toHaveText("Rent");
  await windowLosesFocus(page);
  await page.waitForTimeout(500);
  await expect(headerFigure(page)).toHaveText("6");
  await expect(shown(first)).toHaveText("Rent");
});

test("a regular can be sorted into the category used last time with Enter, Enter, Enter", async ({
  page,
}) => {
  await choose(picker(page, "Fresh Market", "Nov 18, 2026"), { label: "Groceries" });
  await choose(picker(page, "Coffee Bar", "Nov 17, 2026"), { label: "Coffee" });
  await choose(picker(page, "Acme Corp", "Nov 1, 2026"), "ready");
  await expect(headerFigure(page)).toHaveText("3");

  await importFile(
    page,
    bankFile([
      ["20261122", "Acme Corp", 285_000],
      ["20261121", "  coffee bar", -350],
      ["20261120", "Fresh Market", -2_000],
    ]),
    3,
  );
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(headerFigure(page)).toHaveText("6");

  // The same payee, whatever the case or the spaces; a payee never sorted gets no button.
  const suggestion = (payee: string, date: string, into: string) =>
    page.getByRole("button", { name: `Sort ${payee} on ${date} into ${into}, as last time` });
  await expect(suggestion("Acme Corp", "Nov 22, 2026", "No category")).toHaveText("No category");
  await expect(suggestion("  coffee bar", "Nov 21, 2026", "Coffee")).toHaveText("Coffee");
  await expect(suggestion("Fresh Market", "Nov 20, 2026", "Groceries")).toHaveText("Groceries");
  await expect(suggestion("Landlord", "Nov 2, 2026", "Rent")).toHaveCount(0);

  await suggestion("Acme Corp", "Nov 22, 2026", "No category").focus();
  await page.keyboard.press("Enter");
  await expect(suggestion("  coffee bar", "Nov 21, 2026", "Coffee")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(suggestion("Fresh Market", "Nov 20, 2026", "Groceries")).toBeFocused();
  await page.keyboard.press("Enter");
  // The next transaction to sort is the other coffee, which now has a suggestion too.
  await expect(suggestion("Coffee Bar", "Nov 17, 2026", "Coffee").first()).toBeFocused();
  await expect(headerFigure(page)).toHaveText("3");

  await page.getByRole("link", { name: /^All/ }).click();
  await expect(shown(picker(page, "Acme Corp", "Nov 22, 2026"))).toHaveText(
    "No category (income or transfer)",
  );
  await expect(shown(picker(page, "  coffee bar", "Nov 21, 2026"))).toHaveText("Coffee");
  await expect(shown(picker(page, "Fresh Market", "Nov 20, 2026"))).toHaveText("Groceries");
});

test("a list is shown in pages of 200 that never overlap", async ({ page }) => {
  const rows: [string, string, number][] = Array.from({ length: 450 }, (_, i) => {
    const day = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000);
    return [day.toISOString().slice(0, 10).replaceAll("-", ""), `Shop ${i}`, -(100 + i)];
  });
  await importFile(page, bankFile(rows), 450);
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(headerFigure(page)).toHaveText("456");

  const pickers = page.getByRole("combobox", { name: /^Category for / });
  await expect(pickers).toHaveCount(200);
  await expect(page.getByText("Showing 200 of 456.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Newest" })).toHaveCount(0);
  const firstPayee = await page.getByRole("row").nth(1).getByRole("paragraph").first().innerText();

  await page.getByRole("link", { name: "Older" }).click();
  await expect(page).toHaveURL(/before=\d{4}-\d{2}-\d{2}_\d+/);
  await expect(page.getByText("Showing 200 of 456.")).toBeVisible();
  await expect(pickers).toHaveCount(200);
  await expect(page.getByRole("row").nth(1)).not.toContainText(firstPayee);

  await page.getByRole("link", { name: "Older" }).click();
  await expect(page.getByText("Showing 56 of 456.")).toBeVisible();
  await expect(pickers).toHaveCount(56);
  await expect(page.getByRole("link", { name: "Older" })).toHaveCount(0);

  await page.getByRole("link", { name: "Newest" }).click();
  await expect(page).not.toHaveURL(/before/);
  await expect(page.getByText("Showing 200 of 456.")).toBeVisible();

  // Paging also works within "All".
  await page.getByRole("link", { name: /^All/ }).click();
  await expect(page).toHaveURL(/show=all/);
  await page.getByRole("link", { name: "Older" }).click();
  await expect(page).toHaveURL(/show=all.*before=/);
  await expect(page.getByText("Showing 200 of 457.")).toBeVisible();
});

test("an old or odd address does not break the page", async ({ page }) => {
  for (const query of [
    "limit=5000",
    "limit=-5",
    "before=x_y",
    "before=2026-11-05_1.5",
    "show=all&account=1.5&category=abc&month=2026-99&q=%25_%5C",
    "show=all&show=to-sort&q=a&q=b",
  ]) {
    await page.goto(`/transactions?${query}`);
    await expect(page.getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
    await expect(headerFigure(page)).toHaveText("6");
  }
});

test.describe("finding transactions", () => {
  test.beforeEach(async ({ page }) => {
    await choose(picker(page, "Fresh Market", "Nov 18, 2026"), { label: "Groceries" });
    await expect(headerFigure(page)).toHaveText("5");
    await page.getByRole("link", { name: /^All/ }).click();
    await expect(page).toHaveURL(/show=all/);
  });

  const rowsShown = (page: Page) => page.getByRole("combobox", { name: /^Category for / });

  test("a search narrows the list, keeps its address, and says what is in it", async ({ page }) => {
    // Typing alone applies it after a short pause; the case does not matter.
    await page.getByRole("searchbox", { name: "Search payee or note" }).fill("COFFEE");
    await expect(page).toHaveURL(/q=COFFEE/);
    await expect(rowsShown(page)).toHaveCount(2);
    await expect(
      page.getByText("2 transactions match. Money in €0.00, money out €7.00."),
    ).toBeVisible();

    // The note is searched too, and Enter applies it at once.
    const search = page.getByRole("searchbox", { name: "Search payee or note" });
    await search.fill("huur");
    await search.press("Enter");
    await expect(page).toHaveURL(/q=huur/);
    await expect(rowsShown(page)).toHaveCount(1);
    await expect(
      page.getByText("1 transaction matches. Money in €0.00, money out €1,100.00."),
    ).toBeVisible();

    // A search for nothing says so; the address can be shared.
    await page.goto("/transactions?show=all&q=huur");
    await expect(rowsShown(page)).toHaveCount(1);
    await expect(page.getByRole("searchbox", { name: "Search payee or note" })).toHaveValue("huur");

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByRole("searchbox", { name: "Search payee or note" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
  });

  test("the category and the month narrow the list, and show the money of all that match", async ({
    page,
  }) => {
    await page
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption({ label: "Groceries" });
    await expect(rowsShown(page)).toHaveCount(1);
    await expect(
      page.getByText("1 transaction matches. Money in €0.00, money out €45.10."),
    ).toBeVisible();

    // The address the budget page links to.
    const id = await page.getByRole("combobox", { name: "Category", exact: true }).inputValue();
    await page.goto(`/transactions?show=all&category=${id}&month=2026-11`);
    await expect(rowsShown(page)).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue(id);
    await expect(page.getByLabel("Month")).toHaveValue("2026-11");
    await page.getByLabel("Month").fill("2026-10");
    await expect(page).toHaveURL(/month=2026-10/);
    await expect(page.getByText("No transactions match.")).toBeVisible();

    await page.getByRole("button", { name: "Clear" }).click();
    await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("none");
    await expect(picker(page, "Acme Corp", "Nov 1, 2026")).toBeVisible();
    await expect(picker(page, "Fresh Market", "Nov 18, 2026")).toHaveCount(0);
  });
});

test("a transaction can be deleted, and does not come back with the same file", async ({
  page,
}) => {
  await page.getByRole("link", { name: /^All/ }).click();
  const row = page.getByRole("row", { name: /Fresh Market/ });

  const asked: string[] = [];
  page.once("dialog", (dialog) => {
    asked.push(dialog.message());
    void dialog.dismiss();
  });
  await row.hover();
  await row.getByRole("button", { name: "Delete Fresh Market on Nov 18, 2026" }).click();
  expect(asked).toEqual([
    "Delete Fresh Market of -€45.10 on Nov 18, 2026? A later import of the same bank file will not bring it back.",
  ]);
  await expect(row).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Delete Fresh Market on Nov 18, 2026" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^To sort 5/ })).toBeVisible();

  await importFile(page, path.join("e2e", "files", "ing.csv"), 6);
  await expect(
    page.getByText("All 6 transactions in this file were already in LarchBudget."),
  ).toBeVisible();
  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(page.getByRole("link", { name: /^To sort 5/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Fresh Market/ })).toHaveCount(0);
});

test("sorting a transaction that was deleted elsewhere says so", async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto("/transactions?show=all");
  const row = other.getByRole("row", { name: /Fresh Market/ });
  other.once("dialog", (dialog) => void dialog.accept());
  await row.hover();
  await row.getByRole("button", { name: "Delete Fresh Market on Nov 18, 2026" }).click();
  await expect(row).toHaveCount(0);

  await choose(picker(page, "Fresh Market", "Nov 18, 2026"), { label: "Groceries" });
  await expect(alert(page, "That transaction no longer exists. Reload the page.")).toBeVisible();
});
