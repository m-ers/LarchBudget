import type { Page } from "@playwright/test";
import { headerFigure } from "./budget-page";
import { expect, test } from "./fixtures";

test.use({ app: { seed: true } });

/** Starts watching for the loading skeleton; the returned function says whether it appeared. */
async function watchForSkeleton(page: Page) {
  await page.evaluate(() => {
    const state = { seen: false };
    (window as unknown as { skeleton: typeof state }).skeleton = state;
    const look = () => {
      if (document.querySelector(".animate-pulse")) state.seen = true;
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
    look();
  });
  return () =>
    page.evaluate(() => (window as unknown as { skeleton: { seen: boolean } }).skeleton.seen);
}

test("moving between pages swaps them without a loading skeleton in between", async ({ page }) => {
  await page.goto("/");
  await expect(headerFigure(page)).toBeVisible();
  const skeletonSeen = await watchForSkeleton(page);

  await page.getByRole("link", { name: /^Transactions/ }).click();
  await expect(page.getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page.getByRole("heading", { name: "Accounts", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Import from bank" }).click();
  await expect(page.getByRole("heading", { name: "Import from bank", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Budget" }).click();
  await expect(headerFigure(page)).toBeVisible();

  expect(await skeletonSeen()).toBe(false);
});

test("on a slow connection, the link that was clicked lights up while its page is on its way", async ({
  page,
}) => {
  await page.goto("/");
  await expect(headerFigure(page)).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 1500,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  const accounts = page.getByRole("link", { name: "Accounts" });
  await accounts.click();
  // The old page is still there, and the link already shows where things are going.
  await expect(accounts.locator("[data-on-its-way]")).toBeAttached();
  await expect(headerFigure(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounts", level: 1 })).toBeVisible();
  await expect(accounts.locator("[data-on-its-way]")).toHaveCount(0);
  await expect(accounts).toHaveAttribute("aria-current", "page");
});
