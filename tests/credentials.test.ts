import { describe, expect, it } from "vitest";
import {
  accountName,
  passwordValue,
  derivePassword,
} from "../supabase/functions/portal/credentials";

describe("username and password contract", () => {
  it("normalizes usernames, supports Chinese and rejects emails/empty", () => {
    expect(accountName(" Ｔｅｓｔ_角色 ")).toBe("test_角色");
    for (const bad of ["", "a b", "a@b.com", "a".repeat(41), null])
      expect(() => accountName(bad)).toThrow();
  });
  it("accepts one character, preserves spaces, rejects empty and excessive lengths", () => {
    expect(passwordValue("a")).toBe("a");
    expect(passwordValue(" a ")).toBe(" a ");
    expect(() => passwordValue("")).toThrow();
    expect(() => passwordValue("a".repeat(201))).toThrow();
  });
  it("derives a credential per user with a server secret, independent of username", async () => {
    const a = await derivePassword("a", "user-1", "test-only-pepper");
    expect(a).toHaveLength(69);
    expect(a).toBe(await derivePassword("a", "user-1", "test-only-pepper"));
    expect(a).not.toBe(await derivePassword("a", "user-2", "test-only-pepper"));
    expect(a).not.toBe(await derivePassword("b", "user-1", "test-only-pepper"));
    expect(a).not.toBe(await derivePassword("a", "user-1", "other-pepper"));
    await expect(derivePassword("a", "user-1", "")).rejects.toThrow();
  });
});
