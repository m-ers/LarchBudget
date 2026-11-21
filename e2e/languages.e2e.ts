import { headerFigure } from "./helpers";
import { expect, test } from "./fixtures";

test.use({ app: { seed: true } });

const dutchMonth =
  /^(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) \d{4}$/;

test.describe("a browser set to Dutch", () => {
  test.use({ locale: "nl-NL" });

  test("gets LarchBudget in Dutch", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "nl");
    await expect(page.getByRole("link", { name: "Rekeningen" })).toBeVisible();
    await expect(page.getByText("Nog toe te wijzen")).toBeVisible();
    await page.getByRole("link", { name: "Rekeningen" }).click();
    await expect(page.getByRole("heading", { name: "Rekeningen", level: 1 })).toBeVisible();
    await expect(page).toHaveTitle("Rekeningen · LarchBudget");
  });

  test("shows month names in Dutch, and amounts in the number format of LOCALE", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(dutchMonth);
    // LOCALE is en-US in the tests: a dot before the cents.
    await expect(headerFigure(page)).toHaveText(/^€[\d,]+\.\d{2}$/);
  });

  test("can choose English in Settings", async ({ page }) => {
    await page.goto("/settings");
    const language = page.getByRole("combobox", { name: "Taal" });
    await expect(language).toHaveValue("auto");
    await expect(language.locator("option:checked")).toHaveText("Automatisch (Nederlands)");
    await language.selectOption("English");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test("a language chosen in Settings stays, on every page, until Automatic is chosen", async ({
  page,
}) => {
  await page.goto("/settings");
  const language = page.getByRole("combobox", { name: "Language" });
  await expect(language.locator("option:checked")).toHaveText("Automatic (English)");
  await language.selectOption("Nederlands");
  await expect(page.getByRole("heading", { name: "Instellingen", level: 1 })).toBeVisible();

  // Pages loaded in advance before the change are in Dutch too.
  await page.getByRole("link", { name: /^Transacties/ }).click();
  await expect(page.getByRole("heading", { name: "Transacties", level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Transacties", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Instellingen" }).click();
  await page.getByRole("combobox", { name: "Taal" }).selectOption("auto");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});

test("the made-up test language is only offered in development", async ({ page }) => {
  await page.goto("/settings");
  const language = page.getByRole("combobox", { name: "Language" });
  await expect(language.locator("option")).toHaveText([
    "Automatic (English)",
    "English",
    "Nederlands",
  ]);
});
