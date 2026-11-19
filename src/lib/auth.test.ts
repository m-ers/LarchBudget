import { describe, expect, it } from "vitest";
import { safeEqual, sessionIsValid, sessionToken } from "./auth";

describe("sessionIsValid", () => {
  it("accepts only the token that belongs to the password", async () => {
    const token = await sessionToken("correct horse");
    expect(await sessionIsValid(token, "correct horse")).toBe(true);
    expect(await sessionIsValid(token, "another password")).toBe(false);
    expect(await sessionIsValid(token.slice(0, -1) + "0", "correct horse")).toBe(false);
  });

  it("rejects a missing or empty cookie", async () => {
    expect(await sessionIsValid(undefined, "correct horse")).toBe(false);
    expect(await sessionIsValid("", "correct horse")).toBe(false);
  });

  it("does not accept the password itself as a cookie", async () => {
    expect(await sessionIsValid("correct horse", "correct horse")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares whole strings", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
    expect(await safeEqual("abc", "abcd")).toBe(false);
  });
});
