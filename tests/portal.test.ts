import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ db: {} as any, login: {} as any }));
vi.mock("npm:@supabase/supabase-js@2.57.4", () => ({
  createClient: (_url: string, key: string) =>
    key === "service-test" ? mock.db : mock.login,
}));
let handler: (req: Request) => Promise<Response>;
const owner = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";
const license = "00000000-0000-4000-8000-000000000003";
let profiles: any[],
  authUsers: any[],
  licenses: any[],
  sessions: any[],
  challenges: any[];
let limited = false;
let failProfileUpdate = false;

function table(name: string) {
  const rows = () =>
    (({ profiles, licenses, device_sessions: sessions, challenges }) as any)[
      name
    ] || [];
  const filters: ((r: any) => boolean)[] = [];
  let mode = "select",
    value: any;
  const matches = () => rows().filter((r: any) => filters.every((f) => f(r)));
  const result = () => {
    if (mode === "insert")
      rows().push(name === "profiles" ? { enabled: true, ...value } : value);
    if (mode === "update") {
      if (failProfileUpdate && name === "profiles")
        return { data: null, error: "db failed" };
      for (const row of matches()) Object.assign(row, value);
    }
    if (mode === "delete")
      for (const row of matches()) rows().splice(rows().indexOf(row), 1);
    return { data: structuredClone(matches()), error: null };
  };
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (k: string, v: any) => {
      filters.push((r) => r[k] === v);
      return q;
    },
    neq: (k: string, v: any) => {
      filters.push((r) => r[k] !== v);
      return q;
    },
    insert: (v: any) => {
      mode = "insert";
      value = v;
      return q;
    },
    update: (v: any) => {
      mode = "update";
      value = v;
      return q;
    },
    delete: () => {
      mode = "delete";
      return q;
    },
    single: async () => ({
      data: structuredClone(matches()[0]),
      error: matches().length !== 1,
    }),
    maybeSingle: async () => ({
      data: structuredClone(matches()[0] || null),
      error: null,
    }),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return q;
}

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        (
          ({
            SUPABASE_URL: "http://unit.test",
            SUPABASE_SERVICE_ROLE_KEY: "service-test",
            SUPABASE_ANON_KEY: "anon-test",
            LICENSE_PEPPER: "test-only-pepper",
          }) as any
        )[key],
    },
    serve: (fn: typeof handler) => {
      handler = fn;
    },
  });
  Object.assign(mock.db, {
    from: table,
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
      admin: {
        createUser: vi.fn(),
        updateUserById: vi.fn(),
        getUserById: vi.fn(),
        deleteUser: vi.fn(),
      },
    },
  });
  Object.assign(mock.login, { auth: { signInWithPassword: vi.fn() } });
  await import("../supabase/functions/portal/index");
});
beforeEach(() => {
  vi.clearAllMocks();
  profiles = [
    { id: owner, name: "Owner", role: "owner", enabled: true },
    {
      id: member,
      name: "Member",
      username: "member",
      role: "member",
      enabled: true,
    },
  ];
  authUsers = profiles.map((p) => ({
    id: p.id,
    email: `${p.id}@example.test`,
    password: "legacy-secret",
    app_metadata: {},
  }));
  licenses = [
    {
      id: license,
      user_id: member,
      suffix: "123456",
      enabled: true,
      generation: 0,
    },
  ];
  sessions = [];
  challenges = [];
  limited = false;
  failProfileUpdate = false;
  mock.db.auth.getUser.mockImplementation(async (token: string) => ({
    data: { user: authUsers.find((u) => u.id === token) },
    error: !authUsers.some((u) => u.id === token),
  }));
  mock.db.auth.admin.getUserById.mockImplementation(async (id: string) => ({
    data: { user: structuredClone(authUsers.find((u) => u.id === id)) },
    error: null,
  }));
  mock.db.auth.admin.createUser.mockImplementation(async (user: any) => {
    authUsers.push(structuredClone(user));
    return { data: { user }, error: null };
  });
  mock.db.auth.admin.updateUserById.mockImplementation(
    async (id: string, data: any) => {
      Object.assign(
        authUsers.find((u) => u.id === id),
        data,
      );
      return { error: null };
    },
  );
  mock.db.auth.admin.deleteUser.mockResolvedValue({ error: null });
  mock.login.auth.signInWithPassword.mockImplementation(async (data: any) => {
    const user = authUsers.find(
      (u) => u.email === data.email && u.password === data.password,
    );
    return {
      data: {
        user,
        session: user
          ? { access_token: "test-access", refresh_token: "test-refresh" }
          : null,
      },
      error: !user,
    };
  });
  mock.db.rpc.mockImplementation(async (name: string, args: any) => {
    if (name === "portal_limit") return { data: !limited, error: null };
    if (name === "delete_license") {
      licenses = licenses.filter((l) => l.id !== args.p_id);
      sessions = sessions.filter((s) => s.license_id !== args.p_id);
      challenges = challenges.filter((c) => c.license_id !== args.p_id);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
});
async function call(action: string, payload = {}, token = owner) {
  const response = await handler(
    new Request("http://unit.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    }),
  );
  return { status: response.status, body: await response.json() };
}
describe("portal account management", () => {
  it("creates without email, logs in with one character, renames without breaking password", async () => {
    expect(
      (
        await call("admin.createUser", {
          username: "Test",
          name: "QA",
          password: "a",
        })
      ).status,
    ).toBe(200);
    const id = profiles.find((p) => p.username === "test").id;
    expect(authUsers.find((u) => u.id === id).password).not.toBe("a");
    expect(
      (await call("auth.login", { username: "TEST", password: "a" }, ""))
        .status,
    ).toBe(200);
    expect(
      (await call("auth.login", { username: "test", password: "bad" }, ""))
        .status,
    ).toBe(401);
    expect(
      (
        await call("admin.updateUser", {
          id,
          username: "renamed",
          name: "Renamed",
          password: "",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("auth.login", { username: "test", password: "a" }, ""))
        .status,
    ).toBe(401);
    expect(
      (await call("auth.login", { username: "renamed", password: "a" }, ""))
        .status,
    ).toBe(200);
    expect(
      (
        await call("admin.updateUser", {
          id,
          username: "renamed",
          name: "Renamed",
          password: "b",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("auth.login", { username: "renamed", password: "a" }, ""))
        .status,
    ).toBe(401);
    expect(
      (await call("auth.login", { username: "renamed", password: "b" }, ""))
        .body,
    ).toEqual({ access_token: "test-access", refresh_token: "test-refresh" });
  });
  it("preserves legacy owner email login and supports migrating a legacy member", async () => {
    expect(
      (
        await call(
          "auth.login",
          { username: authUsers[0].email, password: "legacy-secret" },
          "",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call("admin.updateUser", {
          id: member,
          username: "新版",
          name: "Member",
          password: "1",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("auth.login", { username: "新版", password: "1" }, ""))
        .status,
    ).toBe(200);
    expect(
      (
        await call("admin.updateUser", {
          id: owner,
          username: "owner",
          name: "Owner",
          password: "1",
        })
      ).status,
    ).toBe(400);
  });
  it("rejects duplicate usernames and empty passwords before Auth changes", async () => {
    expect(
      (
        await call("admin.createUser", {
          username: "MEMBER",
          name: "QA",
          password: "1",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("admin.createUser", {
          username: "new",
          name: "QA",
          password: "",
        })
      ).status,
    ).toBe(400);
    expect(mock.db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it("blocks member/anonymous admin operations and disabled users", async () => {
    for (const token of [member, ""])
      for (const action of [
        "admin.createUser",
        "admin.updateUser",
        "admin.deleteLicense",
      ])
        expect((await call(action, {}, token)).status).toBe(token ? 403 : 401);
    profiles[1].enabled = false;
    expect(
      (
        await call(
          "auth.login",
          { username: "member", password: "legacy-secret" },
          "",
        )
      ).status,
    ).toBe(401);
    expect(mock.db.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it("fails closed on rate limiting", async () => {
    limited = true;
    expect(
      (await call("auth.login", { username: "member", password: "1" }, ""))
        .status,
    ).toBe(429);
    expect(mock.login.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("reports partial password update honestly when profile storage fails", async () => {
    failProfileUpdate = true;
    const result = await call("admin.updateUser", {
      id: member,
      username: "changed",
      name: "Member",
      password: "1",
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("密碼已更新");
    expect(profiles[1].username).toBe("member");
  });
  it("deletes a license through the transactional RPC and leaves users intact", async () => {
    sessions.push({ license_id: license });
    challenges.push({ license_id: license });
    expect((await call("admin.deleteLicense", { id: license })).status).toBe(
      200,
    );
    expect(mock.db.rpc).toHaveBeenCalledWith("delete_license", {
      p_id: license,
      p_actor: owner,
    });
    expect(licenses).toHaveLength(0);
    expect(sessions).toHaveLength(0);
    expect(challenges).toHaveLength(0);
    expect(profiles).toHaveLength(2);
  });
});
