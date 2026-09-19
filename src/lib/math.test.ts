import { describe, it, expect } from "vitest";
import { experience, parseLevels, perTen } from "./math";
describe("accounting", () => {
  it("calculates multi-level EXP with decimal percent", () =>
    expect(
      experience({ 1: "100", 2: "200", 3: "400" }, 1, "50.5", 3, "25"),
    ).toBe("349.5"));
  it("preserves negative returns", () =>
    expect(experience({ 1: "100" }, 1, "60", 1, "50")).toBe("-10"));
  it("rejects missing levels", () =>
    expect(() => experience({ 1: "100", 3: "300" }, 1, "0", 3, "0")).toThrow());
  it("does not round large amounts through Number", () =>
    expect(perTen("9007199254740993", 600)).toBe("9007199254740993"));
  it("zero time is not a rate", () => expect(perTen("100", 0)).toBe("—"));
  it("supports horizontal import", () =>
    expect(
      parseLevels(
        [
          [1, 2],
          ["15", "34"],
        ],
        "rows",
      ),
    ).toEqual({ 1: "15", 2: "34" }));
  it("rejects duplicate levels and formula text", () => {
    expect(() =>
      parseLevels(
        [
          [1, 1],
          [10, 20],
        ],
        "rows",
      ),
    ).toThrow();
    expect(() => parseLevels([[1, "=1+2"]], "columns")).toThrow();
  });
});
