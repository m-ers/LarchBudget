import type { Page } from "@playwright/test";
import {
  addCategories,
  addGroup,
  category,
  clickAway,
  groupHeading,
  groupTotal,
  headerFigure,
  newCategoryField,
} from "./budget-page";
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
  await groupHeading(page, group).hover();
  await page.getByRole("button", { name: `Delete the group ${group}` }).click();
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

  test("does not first add a category half-typed in its field", async ({ page }) => {
    await newCategoryField(page, "Goals").fill("Car");
    const question = answerNextQuestion(page, true);
    await clickDelete(page, "Goals");
    await question;
    await expect(groupHeading(page, "Goals")).toHaveCount(0);
    await expect(category(page, "Car")).toHaveCount(0);
  });
});

test("a group heading always shows how to add a category; delete shows on hover", async ({
  page,
}) => {
  await page.goto("/");
  await addGroup(page, "Fixed");
  await addCategories(page, "Fixed", ["Rent"]);
  await clickAway(page);

  const add = page.getByRole("button", { name: "Add a category to Fixed" });
  const remove = page.getByRole("button", { name: "Delete the group Fixed" });
  await expect(add).toHaveCSS("opacity", "1");
  await expect(remove).toHaveCSS("opacity", "0");

  await groupHeading(page, "Fixed").hover();
  await expect(remove).toHaveCSS("opacity", "1");
  await add.click();
  await expect(newCategoryField(page, "Fixed")).toBeFocused();
});
