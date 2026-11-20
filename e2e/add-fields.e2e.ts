import {
  addCategories,
  addGroup,
  alert,
  category,
  clickAway,
  groupHeading,
  newCategoryField,
  newGroupField,
  openNewCategory,
  slowConnection,
  windowLosesFocus,
} from "./budget-page";
import { expect, test } from "./fixtures";

// The "new group" and "new category" fields: Enter or clicking away adds,
// Escape drops what was typed.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test.describe("new group", () => {
  test("clicking away adds it", async ({ page }) => {
    await newGroupField(page).fill("Fixed");
    await clickAway(page);
    await expect(groupHeading(page, "Fixed")).toBeVisible();
    await expect(newGroupField(page)).toHaveValue("");
  });

  test("Enter adds it and keeps the field ready for the next", async ({ page }) => {
    await newGroupField(page).fill("Fixed");
    await newGroupField(page).press("Enter");
    await expect(groupHeading(page, "Fixed")).toBeVisible();
    await expect(newGroupField(page)).toBeFocused();
    await expect(newGroupField(page)).toHaveValue("");
  });

  test("Escape drops the name", async ({ page }) => {
    await newGroupField(page).fill("Temp");
    await newGroupField(page).press("Escape");
    await expect(newGroupField(page)).toHaveValue("");
    await expect(groupHeading(page, "Temp")).toHaveCount(0);
  });

  test("a duplicate keeps the name with the reason, and Escape clears both", async ({ page }) => {
    await addGroup(page, "Fixed");
    await newGroupField(page).fill("fixed");
    await clickAway(page);
    await expect(alert(page, 'You already have a group called "fixed".')).toBeVisible();
    await expect(newGroupField(page)).toHaveValue("fixed");

    await newGroupField(page).click();
    await page.keyboard.press("Escape");
    await expect(alert(page, "already have a group")).toHaveCount(0);
    await expect(newGroupField(page)).toHaveValue("");
  });
});

test.describe("new category in an empty group", () => {
  test.beforeEach(async ({ page }) => {
    await addGroup(page, "Fixed");
  });

  test("clicking away adds it, and the field closes", async ({ page }) => {
    await newCategoryField(page, "Fixed").fill("Hypotheek");
    await clickAway(page);
    await expect(category(page, "Hypotheek")).toBeVisible();
    await expect(newCategoryField(page, "Fixed")).toHaveCount(0);
  });

  test("Escape drops the name; the field stays, as the group has nothing else", async ({
    page,
  }) => {
    await newCategoryField(page, "Fixed").fill("Groceries");
    await newCategoryField(page, "Fixed").press("Escape");
    await expect(newCategoryField(page, "Fixed")).toHaveValue("");
    await expect(newCategoryField(page, "Fixed")).toBeVisible();
    await expect(category(page, "Groceries")).toHaveCount(0);
  });
});

test.describe("new category in a group with categories", () => {
  test.beforeEach(async ({ page }) => {
    await addGroup(page, "Fixed");
    await addCategories(page, "Fixed", ["Rent"]);
    await clickAway(page);
    await expect(newCategoryField(page, "Fixed")).toHaveCount(0);
  });

  test("clicking away adds it and closes the field", async ({ page }) => {
    await openNewCategory(page, "Fixed");
    await page.keyboard.type("Water");
    await clickAway(page);
    await expect(category(page, "Water")).toBeVisible();
    await expect(newCategoryField(page, "Fixed")).toHaveCount(0);
  });

  test("Enter adds it and keeps the field open for the next", async ({ page }) => {
    await openNewCategory(page, "Fixed");
    await page.keyboard.type("Internet");
    await page.keyboard.press("Enter");
    await expect(category(page, "Internet")).toBeVisible();
    await expect(newCategoryField(page, "Fixed")).toBeFocused();
    await expect(newCategoryField(page, "Fixed")).toHaveValue("");

    await clickAway(page);
    await expect(newCategoryField(page, "Fixed")).toHaveCount(0);
  });

  test("Escape drops the name and closes the field", async ({ page }) => {
    await openNewCategory(page, "Fixed");
    await page.keyboard.type("Energy");
    await page.keyboard.press("Escape");
    await expect(newCategoryField(page, "Fixed")).toHaveCount(0);
    await expect(category(page, "Energy")).toHaveCount(0);
  });

  test("a duplicate keeps the name with the reason, and Escape clears both", async ({ page }) => {
    await openNewCategory(page, "Fixed");
    await page.keyboard.type("rent");
    await clickAway(page);
    await expect(alert(page, 'You already have a category called "rent".')).toBeVisible();
    await expect(newCategoryField(page, "Fixed")).toHaveValue("rent");

    await newCategoryField(page, "Fixed").click();
    await page.keyboard.press("Escape");
    await expect(alert(page, "already have a category")).toHaveCount(0);
    await expect(newCategoryField(page, "Fixed")).toHaveCount(0);
  });
});

test.describe("switching to another window", () => {
  test("does not add a half-typed group", async ({ page }) => {
    await newGroupField(page).fill("Half");
    await newGroupField(page).focus();
    await windowLosesFocus(page);
    await page.waitForTimeout(500);
    await expect(groupHeading(page, "Half")).toHaveCount(0);
    await expect(newGroupField(page)).toHaveValue("Half");
  });

  test("does not save a half-typed rename or amount", async ({ page }) => {
    await addGroup(page, "Fixed");
    await addCategories(page, "Fixed", ["Water"]);

    await category(page, "Water").click();
    await page.keyboard.type("Wat");
    await windowLosesFocus(page);
    await page.waitForTimeout(500);
    const rename = page.getByRole("textbox", { name: "Category name" });
    await expect(rename).toHaveValue("Wat");
    await rename.press("Escape");
    await expect(category(page, "Water")).toBeVisible();

    const amount = page.getByRole("textbox", { name: "Assigned to Water" });
    await amount.click();
    await page.keyboard.type("12");
    await windowLosesFocus(page);
    await page.waitForTimeout(500);
    await expect(amount).toBeFocused();
    await expect(amount).toHaveValue("12");

    await page.keyboard.type("5");
    await clickAway(page);
    await expect(amount).toHaveValue("125.00");
  });
});

test.describe("on a slow connection", () => {
  test.beforeEach(async ({ page }) => {
    await addGroup(page, "Fixed");
    await addCategories(page, "Fixed", ["Rent"]);
    await slowConnection(page, 800);
  });

  test("the field clears at once, so the next name can be typed meanwhile", async ({ page }) => {
    const field = newCategoryField(page, "Fixed");
    await field.fill("Gas");
    await field.press("Enter");
    await expect(field).toHaveValue("");
    await expect(page.getByText("Adding…")).toBeVisible();

    await page.keyboard.type("Phone");
    await expect(category(page, "Gas")).toBeVisible();
    await expect(field).toHaveValue("Phone");
    await field.press("Enter");
    await expect(category(page, "Phone")).toBeVisible();
  });

  test("a name that cannot be added comes back with the reason", async ({ page }) => {
    const field = newCategoryField(page, "Fixed");
    await field.fill("rent");
    await field.press("Enter");
    await expect(field).toHaveValue("");
    await expect(alert(page, 'You already have a category called "rent".')).toBeVisible();
    await expect(field).toHaveValue("rent");
  });
});
