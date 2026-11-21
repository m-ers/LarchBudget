import { addGroup, groupHeading } from "./helpers";
import { expect, test } from "./fixtures";

test.describe("with a password", () => {
  test.use({ app: { password: "s3cret" } });

  test("every page asks for it first", async ({ page }) => {
    for (const path of ["/", "/accounts"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("a wrong password is refused", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Wrong password." })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("after logging in, pages and changes work until the session ends", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Password").fill("s3cret");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/$/);

    await addGroup(page, "Everyday");
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logging out ends the session", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Password").fill("s3cret");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test("without a password, the budget opens straight away", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  await addGroup(page, "Everyday");
  await expect(groupHeading(page, "Everyday")).toBeVisible();
});
