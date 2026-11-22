import { describe, expect, it } from "vitest";
import { categoryIcons, isCategoryIcon } from "./category-icons";

describe("category icons", () => {
  it("are about forty, each listed once, with ids in Lucide's style", () => {
    expect(categoryIcons.length).toBeGreaterThanOrEqual(35);
    expect(categoryIcons.length).toBeLessThanOrEqual(47);
    expect(new Set(categoryIcons).size).toBe(categoryIcons.length);
    for (const id of categoryIcons) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("accept every id in the set", () => {
    for (const id of categoryIcons) expect(isCategoryIcon(id)).toBe(true);
  });

  it("refuse anything else", () => {
    for (const value of [
      "rocket",
      "House",
      "shoppingCart",
      " house",
      "",
      "toString",
      "__proto__",
      null,
      undefined,
      1,
      ["house"],
      { id: "house" },
    ]) {
      expect(isCategoryIcon(value)).toBe(false);
    }
  });
});
