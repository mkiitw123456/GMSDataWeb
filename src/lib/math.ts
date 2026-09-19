import Decimal from "decimal.js";
Decimal.set({ precision: 50 });
export function perTen(value: string | number, seconds: number) {
  return seconds > 0
    ? new Decimal(value).mul(600).div(seconds).toFixed(0)
    : "—";
}
export function number(value: string | number) {
  return value === "—"
    ? "—"
    : new Decimal(value).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
export function duration(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export function experience(
  levels: Record<number, string>,
  a: number,
  ap: string,
  b: number,
  bp: string,
) {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 1 ||
    b < 1 ||
    a > 1000 ||
    b > 1000
  )
    throw Error("等級必須介於1–1000");
  const pa = new Decimal(ap),
    pb = new Decimal(bp);
  if (
    !pa.isFinite() ||
    !pb.isFinite() ||
    pa.lt(0) ||
    pa.gte(100) ||
    pb.lt(0) ||
    pb.gte(100)
  )
    throw Error("百分比必須介於0至未滿100");
  for (let l = Math.min(a, b); l <= Math.max(a, b); l++)
    if (!levels[l] || !new Decimal(levels[l]).gt(0))
      throw Error(`缺少等級 ${l} 經驗值`);
  let total = new Decimal(0);
  for (let l = Math.min(a, b); l < Math.max(a, b); l++)
    total = total.plus(levels[l]);
  if (b < a) total = total.neg();
  return total
    .plus(new Decimal(levels[b]).mul(pb).div(100))
    .minus(new Decimal(levels[a]).mul(pa).div(100))
    .toString();
}
export function parseLevels(
  rows: unknown[][],
  orientation: "rows" | "columns",
) {
  const pairs =
    orientation === "rows"
      ? (rows[0] || []).map((l, i) => [l, rows[1]?.[i]])
      : rows;
  if (!pairs.length || pairs.length > 1000) throw Error("需要1–1000筆等級資料");
  const result: Record<number, string> = {};
  for (const pair of pairs) {
    if (typeof pair[1] === "number" && !Number.isSafeInteger(pair[1]))
      throw Error("大型經驗值請在Excel設為文字，避免數值精度遺失");
    const l = Number(pair[0]),
      v = String(pair[1] ?? "").trim();
    if (
      !Number.isInteger(l) ||
      l < 1 ||
      l > 1000 ||
      !/^\d+$/.test(v) ||
      !new Decimal(v).gt(0) ||
      v.length > 25 ||
      result[l]
    )
      throw Error("有重複等級、空值或無效經驗值；只接受正整數且不要包含標題列");
    result[l] = v;
  }
  const keys = Object.keys(result)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.some((v, i) => i > 0 && v !== keys[i - 1] + 1))
    throw Error("等級不可缺號");
  return result;
}
