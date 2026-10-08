// Passwords are never trimmed, logged or stored by the portal. Supabase still
// hashes the derived credential with its normal password hashing mechanism.
export function accountName(value: unknown): string {
  if (typeof value !== "string") throw new Error("請輸入登入帳號");
  const name = value.trim().normalize("NFKC").toLowerCase();
  if (!/^[\p{L}\p{N}_.-]{1,40}$/u.test(name))
    throw new Error("帳號限 1–40 字，可使用中英文、數字、底線、點或連字號");
  return name;
}

export function passwordValue(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200)
    throw new Error("密碼需為 1–200 字元");
  return value;
}

export async function derivePassword(
  password: string,
  userId: string,
  pepper: string,
) {
  if (!pepper) throw new Error("登入服務尚未配置");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(JSON.stringify(["gms-web-password-v1", userId, password])),
  );
  return (
    "Gms1!" +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
