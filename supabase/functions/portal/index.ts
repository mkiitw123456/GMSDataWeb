import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Service key stays here, never in VITE_* or desktop builds.
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const encoder = new TextEncoder();
class Failure extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const string = (v: unknown, max = 200) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Failure("欄位格式無效");
  return v.trim();
};
const uuid = (v: unknown) => {
  const s = string(v, 36);
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(s))
    throw new Failure("識別碼格式無效");
  return s;
};
const bool = (v: unknown) => {
  if (typeof v !== "boolean") throw new Failure("狀態格式無效");
  return v;
};
const bytes = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
const sha = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
async function hashCode(code: string) {
  const pepper = Deno.env.get("LICENSE_PEPPER");
  if (!pepper) throw new Failure("授權服務尚未配置", 503);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(code)));
}
function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    console.error("Database operation failed");
    throw new Failure("資料處理失敗，請檢查欄位或稍後重試。", 400);
  }
  return result.data;
}
async function limit(key: string, max: number) {
  if (!check(await db.rpc("portal_limit", { p_key: key, p_max: max })))
    throw new Failure("操作過於頻繁，請稍後再試。", 429);
}
async function profile(id: string) {
  const p = check(
    await db
      .from("profiles")
      .select("id,name,role,enabled")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!p?.enabled) throw new Failure("帳號尚未開通或已停用", 403);
  return p;
}
async function member(req: Request) {
  const token =
    req.headers.get("Authorization")?.replace(/^Bearer /i, "") || "";
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Failure("請重新登入", 401);
  return await profile(data.user.id);
}
async function device(token: unknown) {
  const hash = await sha(string(token, 64));
  const s = check(
    await db
      .from("device_sessions")
      .select("license_id,generation,expires_at")
      .eq("token_hash", hash)
      .maybeSingle(),
  );
  if (!s || Date.parse(s.expires_at) <= Date.now())
    throw new Failure("設備登入已到期", 401);
  const l = check(
    await db
      .from("licenses")
      .select("id,user_id,enabled,generation")
      .eq("id", s.license_id)
      .single(),
  );
  if (!l.enabled || l.generation !== s.generation)
    throw new Failure("授權已撤銷", 403);
  return await profile(l.user_id);
}
async function notifyMismatch(id: string) {
  if (!check(await db.rpc("portal_limit", { p_key: `notify:${id}`, p_max: 1 })))
    return;
  const webhook = Deno.env.get("DISCORD_SECURITY_WEBHOOK");
  if (!webhook) return;
  try {
    const u = new URL(webhook);
    if (
      u.hostname !== "discord.com" ||
      !u.pathname.startsWith("/api/webhooks/")
    )
      return;
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `GMS Data：已拒絕其他設備使用既有授權（${id.slice(0, 8)}）。請至後台檢查。`,
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    console.error("Security notification delivery failed");
  }
}
function normalizeSession(p: Record<string, unknown>) {
  const amount = (v: unknown) => {
    const s = string(v, 25);
    if (!/^\d+$/.test(s)) throw new Failure("數量必須為非負整數");
    return s;
  };
  const level = (v: unknown) => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 1000)
      throw new Failure("等級無效");
    return v;
  };
  const percent = (v: unknown) => {
    const s = string(v, 10);
    if (!/^\d{1,2}(\.\d{1,6})?$/.test(s) || Number(s) >= 100)
      throw new Failure("經驗百分比需介於0至未滿100，最多6位小數");
    return s;
  };
  if (
    typeof p.seconds !== "number" ||
    !Number.isFinite(p.seconds) ||
    p.seconds <= 0 ||
    p.seconds > 2678400
  )
    throw new Failure("有效時間需大於0且不超過31天");
  if (!Array.isArray(p.items) || p.items.length > 100)
    throw new Failure("道具列表最多100項");
  const names = new Set<string>();
  const items = p.items
    .map((i) => {
      const name = string(i.name, 80).normalize("NFC");
      if (names.has(name)) throw new Failure("道具名稱重複");
      names.add(name);
      return {
        id: uuid(i.id),
        name,
        start: amount(i.start),
        end: amount(i.end),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    id: uuid(p.id),
    map: string(p.map, 100).normalize("NFC"),
    profession: string(p.profession, 60).normalize("NFC"),
    seconds: p.seconds,
    start_level: level(p.start_level),
    end_level: level(p.end_level),
    start_percent: percent(p.start_percent),
    end_percent: percent(p.end_percent),
    start_mesos: amount(p.start_mesos),
    end_mesos: amount(p.end_mesos),
    version_id: uuid(p.version_id),
    notes: typeof p.notes === "string" ? p.notes.slice(0, 2000) : "",
    items,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .filter(Boolean);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && allowed.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin))
    return response({ error: "此網站尚未列入允許來源" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return response({ error: "Method not allowed" }, 405);
  try {
    // Stream-limited request body; Content-Length alone is not trusted.
    let raw = "";
    const reader = req.body?.getReader();
    if (!reader) throw new Failure("缺少資料");
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Failure("資料超過64KB", 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const p = JSON.parse(raw);
    const action = string(p.action, 40);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    await limit(`ip:${await sha(ip)}`, 120);
    if (action === "device.activate") {
      await limit(`activate:${await sha(ip)}`, 8);
      const publicKey = string(p.public_key, 44);
      if (bytes(publicKey).length !== 32) throw new Failure("設備金鑰無效");
      const machine = string(p.machine_hash, 64);
      if (!/^[a-f0-9]{64}$/.test(machine)) throw new Failure("設備指紋無效");
      const result = check(
        await db.rpc("bind_license", {
          p_hash: await hashCode(string(p.code, 100)),
          p_key: publicKey,
          p_machine: machine,
        }),
      );
      if (result.error) {
        if (result.license_id) await notifyMismatch(result.license_id);
        throw new Failure(result.error, 403);
      }
      return response(result);
    }
    if (action === "device.challenge") {
      const id = uuid(p.license_id);
      await limit(`challenge:${id}`, 10);
      const l = check(
        await db
          .from("licenses")
          .select("id,enabled,public_key")
          .eq("id", id)
          .maybeSingle(),
      );
      if (!l?.enabled || !l.public_key) throw new Failure("設備尚未授權", 403);
      const nonce = random();
      const result = check(
        await db
          .from("challenges")
          .insert({ license_id: id, nonce })
          .select("id,nonce")
          .single(),
      );
      return response(result);
    }
    if (action === "device.verify") {
      const id = uuid(p.challenge_id);
      const c = check(
        await db.from("challenges").select("*").eq("id", id).maybeSingle(),
      );
      if (!c || Date.parse(c.expires_at) <= Date.now())
        throw new Failure("登入挑戰已失效", 401);
      await limit(`verify:${c.license_id}`, 12);
      const l = check(
        await db.from("licenses").select("*").eq("id", c.license_id).single(),
      );
      if (!l.enabled || !l.public_key || p.machine_hash !== l.machine_hash) {
        await notifyMismatch(l.id);
        throw new Failure("設備不符或授權已停用", 403);
      }
      const key = await crypto.subtle.importKey(
        "raw",
        bytes(l.public_key),
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      const message = `gms-data-v1:${id}:${c.nonce}:${l.id}:${l.machine_hash}`;
      if (
        !(await crypto.subtle.verify(
          "Ed25519",
          key,
          bytes(string(p.signature, 88)),
          encoder.encode(message),
        ))
      )
        throw new Failure("設備簽章錯誤", 403);
      const token = random();
      if (
        !check(
          await db.rpc("issue_device_session", {
            p_challenge: id,
            p_license: l.id,
            p_generation: l.generation,
            p_token: await sha(token),
          }),
        )
      )
        throw new Failure("挑戰已使用或授權已失效", 401);
      return response({ token, expires_in: 900 });
    }
    const who = p.device_token
      ? await device(p.device_token)
      : await member(req);
    await limit(`user:${who.id}`, 90);
    if (action === "me") return response(who);
    if (action === "summaries")
      return response(
        check(
          await db.from("portal_summaries").select("*").order("map").limit(500),
        ),
      );
    if (action === "sessions") {
      const page = p.page ?? 0;
      if (!Number.isInteger(page) || page < 0 || page > 10000)
        throw new Failure("分頁無效");
      return response(
        check(
          await db
            .from("portal_sessions")
            .select("*")
            .eq("map", string(p.map, 100))
            .order("ended_at", { ascending: false })
            .order("id")
            .range(page * 20, page * 20 + 19),
        ),
      );
    }
    if (action === "experience.latest") {
      const version = check(
        await db
          .from("experience_versions")
          .select("id,name")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      if (!version) throw new Failure("管理員尚未建立經驗表");
      return response(version);
    }
    if (action === "session.submit") {
      const normalized = normalizeSession(p.session);
      const id = check(
        await db.rpc("submit_session", {
          p_user: who.id,
          p: normalized,
          p_hash: await sha(JSON.stringify(normalized)),
        }),
      );
      return response({ id });
    }
    if (who.role !== "owner") throw new Failure("只有擁有者可執行此操作", 403);
    if (action === "admin.list") {
      const [users, licenses, versions] = await Promise.all([
        db.from("profiles").select("*").order("name").limit(1000),
        db
          .from("licenses")
          .select("id,user_id,suffix,enabled,public_key,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        db
          .from("experience_versions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      return response({
        users: check(users),
        licenses: check(licenses).map(({ public_key, ...l }) => ({
          ...l,
          bound: !!public_key,
        })),
        versions: check(versions),
      });
    }
    if (action === "admin.createUser") {
      const password = string(p.password, 200);
      if (password.length < 12) throw new Failure("初始密碼至少12字元");
      const name = string(p.name, 60);
      const { data, error } = await db.auth.admin.createUser({
        email: string(p.email, 254),
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new Failure("帳號建立失敗，請確認Email尚未被使用");
      const created = await db
        .from("profiles")
        .insert({ id: data.user.id, name, role: "member" });
      if (created.error) {
        await db.auth.admin.deleteUser(data.user.id);
        throw new Failure("帳號資料建立失敗");
      }
      return response({ ok: true });
    }
    if (action === "admin.setUser") {
      const id = uuid(p.id);
      const target = check(
        await db.from("profiles").select("role").eq("id", id).single(),
      );
      if (target.role === "owner")
        throw new Failure("不能透過此介面停用擁有者");
      check(
        await db
          .from("profiles")
          .update({ enabled: bool(p.enabled) })
          .eq("id", id),
      );
      return response({ ok: true });
    }
    if (action === "admin.createLicense") {
      const uid = uuid(p.user_id);
      await profile(uid);
      const code = `GMS-${random()}`;
      check(
        await db
          .from("licenses")
          .insert({
            user_id: uid,
            code_hash: await hashCode(code),
            suffix: code.slice(-6),
          }),
      );
      return response({ code });
    }
    if (action === "admin.setLicense") {
      const id = uuid(p.id);
      check(
        await db
          .from("licenses")
          .update({ enabled: bool(p.enabled) })
          .eq("id", id),
      );
      check(await db.from("device_sessions").delete().eq("license_id", id));
      return response({ ok: true });
    }
    if (action === "admin.unbind") {
      check(
        await db.rpc("unbind_license", {
          p_id: uuid(p.id),
          p_actor: who.id,
          p_reason: string(p.reason, 300),
        }),
      );
      return response({ ok: true });
    }
    if (action === "admin.experience") {
      if (
        !p.levels ||
        Array.isArray(p.levels) ||
        Object.keys(p.levels).length > 1000
      )
        throw new Failure("經驗表無效");
      for (const [k, v] of Object.entries(p.levels))
        if (
          !/^[1-9]\d{0,3}$/.test(k) ||
          Number(k) > 1000 ||
          typeof v !== "string" ||
          !/^[1-9]\d{0,24}$/.test(v)
        )
          throw new Failure("等級與經驗必須為正整數");
      return response({
        id: check(
          await db.rpc("save_experience", {
            p_name: string(p.name, 60),
            p_levels: p.levels,
          }),
        ),
      });
    }
    throw new Failure("不支援的操作", 404);
  } catch (e) {
    return response(
      {
        error:
          e instanceof Failure ? e.message : "請求格式無效或服務暫時無法使用",
      },
      e instanceof Failure ? e.status : 400,
    );
  }
});
