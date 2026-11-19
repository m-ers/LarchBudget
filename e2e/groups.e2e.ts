import type { Page } from "@playwright/test";
import { addGroup, category, groupHeading, headerFigure, newCategoryField } from "./budget-page";
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
    // The demo data: €2,865.00 ready to assign, and Everyday holds €262.00.
    await expect(headerFigure(page)).toHaveText("€2,865.00");
    await expect(groupHeading(page, "Everyday").locator("xpath=..")).toContainText("€262.00");

    const question = answerNextQuestion(page, true);
    await clickDelete(page, "Everyday");
    await question;
    await expect(groupHeading(page, "Everyday")).toHaveCount(0);
    await expect(category(page, "Groceries")).toHaveCount(0);
    await expect(category(page, "Eating out")).toHaveCount(0);
    await expect(headerFigure(page)).toHaveText("€3,127.00");
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
