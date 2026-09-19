import { Unzip, UnzipInflate } from "fflate";
import { parseLevels } from "./math";
// Inspect the ZIP stream before handing it to the workbook parser. Limit expanded
// bytes and disallow formulas/macros/external references (including cached formulas).
export async function readLevels(file: File, orientation: "rows" | "columns") {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 1024 * 1024)
    throw Error("只接受1MB以內的.xlsx檔案");
  const input = new Uint8Array(await file.arrayBuffer());
  let total = 0,
    entries = 0,
    sheets = 0;
  const unzip = new Unzip((entry) => {
    if (++entries > 200) throw Error("Excel內部檔案過多");
    if (/vbaProject|externalLinks/i.test(entry.name))
      throw Error("不接受巨集或外部連結");
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name) && ++sheets > 1)
      throw Error("請使用只有一張工作表的檔案");
    let xml = "";
    const decoder = new TextDecoder();
    entry.ondata = (error, chunk, final) => {
      if (error) throw error;
      total += chunk.byteLength;
      if (total > 8 * 1024 * 1024) {
        entry.terminate();
        throw Error("Excel展開後過大");
      }
      if (entry.name.endsWith(".xml")) {
        xml += decoder.decode(chunk, { stream: !final });
        if (
          final &&
          (/<(?:\w+:)?f(?:\s|>)/.test(xml) || /<!DOCTYPE/i.test(xml))
        )
          throw Error("Excel包含公式，請先貼上為純數值");
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(input, true);
  if (sheets !== 1) throw Error("找不到唯一工作表");
  const { default: read } = await import("read-excel-file");
  return parseLevels(await read(file), orientation);
}
