import type { Page } from "@playwright/test";
import {
  addCategories,
  addGroup,
  category,
  clickAway,
  groupHeading,
  groupMenuButton,
  groupTotal,
  headerFigure,
  menuItem,
  newCategoryField,
  openGroupMenu,
} from "./helpers";
import { expect, test } from "./fixtures";

/** Answers the next confirmation, and returns its question. */
function answerNextQuestion(page: Page, accept: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once("dialog", (dialog) => {
      resolve(dialog.message());
      void (accept ? dialog.accept() : dialog.dismiss());
    });
  });
}

async function clickDelete(page: Page, group: string) {
  await openGroupMenu(page, group);
  await menuItem(page, "Delete group").click();
}

test.describe("deleting a group with categories", () => {
  test.use({ app: { seed: true } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(groupHeading(page, "Everyday")).toBeVisible();
  });

  test("asks first, and Cancel changes nothing", async ({ page }) => {
    const before = await headerFigure(page).innerText();
    const question = answerNextQuestion(page, false);
    await clickDelete(page, "Everyday");
    expect(await question).toBe(
      'Delete the group "Everyday"? Its 2 categories will be archived, and the money in them goes back to Ready to assign.',
    );
    await expect(groupHeading(page, "Everyday")).toBeVisible();
    await expect(headerFigure(page)).toHaveText(before);
  });

  test("archives its categories and gives their money back", async ({ page }) => {
    // Read from the page: what the demo data holds depends on the day of the month.
    const cents = (money: string) => Math.round(Number(money.replace(/[^0-9.-]/g, "")) * 100);
    const before = cents(await headerFigure(page).innerText());
    const held = cents(await groupTotal(page, "Everyday").innerText());
    expect(held).not.toBe(0);

    const question = answerNextQuestion(page, true);
    await clickDelete(page, "Everyday");
    await question;
    await expect(groupHeading(page, "Everyday")).toHaveCount(0);
    await expect(category(page, "Groceries")).toHaveCount(0);
    await expect(category(page, "Eating out")).toHaveCount(0);
    await expect.poll(async () => cents(await headerFigure(page).innerText())).toBe(before + held);
  });
});

test.describe("deleting an empty group", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await addGroup(page, "Goals");
  });

  test("asks a plain question", async ({ page }) => {
    const question = answerNextQuestion(page, true);
    await clickDelete(page, "Goals");
    expect(await question).toBe('Delete the group "Goals"?');
    await expect(groupHeading(page, "Goals")).toHaveCount(0);
  });

  test("opening the menu adds a category half-typed in its field, and the question counts it", async ({
    page,
  }) => {
    await newCategoryField(page, "Goals").fill("Car");
    // Like any other way of leaving the field.
    await openGroupMenu(page, "Goals");
    await expect(category(page, "Car")).toBeVisible();
    const question = answerNextQuestion(page, false);
    await menuItem(page, "Delete group").click();
    expect(await question).toBe(
      'Delete the group "Goals"? Its category will be archived, and the money in it goes back to Ready to assign.',
    );
  });
});

test("a group heading always shows how to add a category; its menu shows on hover", async ({
  page,
}) => {
  await page.goto("/");
  await addGroup(page, "Fixed");
  await addCategories(page, "Fixed", ["Rent"]);
  await clickAway(page);

  const add = page.getByRole("button", { name: "Add a category to Fixed" });
  const menu = groupMenuButton(page, "Fixed");
  await expect(add).toHaveCSS("opacity", "1");
  await expect(menu).toHaveCSS("opacity", "0");

  await groupHeading(page, "Fixed").hover();
  await expect(menu).toHaveCSS("opacity", "1");
  await add.click();
  await expect(newCategoryField(page, "Fixed")).toBeFocused();
});
