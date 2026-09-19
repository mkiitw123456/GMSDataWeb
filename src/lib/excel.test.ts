import { it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readLevels } from "./excel";
it("rejects cached spreadsheet formulas before parsing", async () => {
  const zip = zipSync({
    "xl/worksheets/sheet1.xml": strToU8(
      "<worksheet><c><f>1+1</f><v>2</v></c></worksheet>",
    ),
  });
  await expect(
    readLevels(new File([zip], "test.xlsx"), "rows"),
  ).rejects.toThrow("公式");
});
it("rejects oversized input", async () => {
  await expect(
    readLevels(
      new File([new Uint8Array(1024 * 1024 + 1)], "test.xlsx"),
      "rows",
    ),
  ).rejects.toThrow("1MB");
});
it("rejects macros and external links", async () => {
  const zip = zipSync({ "xl/externalLinks/link1.xml": strToU8("<links/>") });
  await expect(
    readLevels(new File([zip], "test.xlsx"), "rows"),
  ).rejects.toThrow("外部連結");
});
