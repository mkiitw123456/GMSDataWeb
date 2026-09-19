import { useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Upload } from "lucide-react";
import { api, demo, type License, type Profile } from "../lib/api";
import { number, parseLevels } from "../lib/math";
import { Dialog, Field, Notice } from "./UI";
export type AdminPage = "licenses" | "users" | "experience";
export const labels = {
  licenses: "授權碼管理",
  users: "使用者管理",
  experience: "經驗值表",
};
export function Admin({ page }: { page: AdminPage }) {
  const [users, setUsers] = useState<Profile[]>([]),
    [licenses, setLicenses] = useState<License[]>([]),
    [versions, setVersions] = useState<
      { id: string; name: string; created_at: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [creating, setCreating] = useState(false),
    [code, setCode] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      if (!demo) {
        const data = await api<{
          users: Profile[];
          licenses: License[];
          versions: typeof versions;
        }>("admin.list");
        setUsers(data.users);
        setLicenses(data.licenses);
        setVersions(data.versions);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    setCreating(false);
    setMessage("");
  }, [page]);
  async function action(name: string, payload: Record<string, unknown>) {
    if (demo) {
      setMessage("設計預覽不會建立或修改雲端資料。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code?: string }>(name, payload);
      if (result.code) setCode(result.code);
      setCreating(false);
      setMessage("已儲存。");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    void action(
      page === "users" ? "admin.createUser" : "admin.createLicense",
      f,
    );
  }
  return (
    <>
      <div className="toolbar">
        <span className="muted">
          系統管理 <span className="slash">/</span> {labels[page]}
        </span>
        <button disabled={busy} onClick={load}>
          <RefreshCw size={18} />
          重新整理
        </button>
      </div>
      {demo && <Notice>本機設計預覽 · 管理操作不會送出。</Notice>}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <section className="panel">
        <header className="panel-title">
          <h1>{labels[page]}</h1>
          {page !== "experience" && (
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus size={18} />
              {page === "users" ? "新增帳號" : "建立授權碼"}
            </button>
          )}
        </header>
        {page === "users" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>顯示名稱</th>
                  <th>角色</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.role === "owner" ? "擁有者" : "一般使用者"}</td>
                    <td>{u.enabled ? "啟用" : "停用"}</td>
                    <td>
                      {u.role !== "owner" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            action("admin.setUser", {
                              id: u.id,
                              enabled: !u.enabled,
                            })
                          }
                        >
                          {u.enabled ? "停用" : "啟用"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page === "licenses" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>使用者</th>
                  <th>授權碼末碼</th>
                  <th>設備</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {users.find((u) => u.id === l.user_id)?.name || "—"}
                    </td>
                    <td>•••• {l.suffix}</td>
                    <td>{l.bound ? "已綁定" : "未綁定"}</td>
                    <td>{l.enabled ? "啟用" : "停用"}</td>
                    <td>
                      <div className="actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            action("admin.setLicense", {
                              id: l.id,
                              enabled: !l.enabled,
                            })
                          }
                        >
                          {l.enabled ? "停用" : "啟用"}
                        </button>
                        <button
                          disabled={!l.bound || busy}
                          onClick={() => {
                            const reason = prompt(
                              "解除设备綁定會使舊設備失效。請填寫原因：",
                            );
                            if (reason?.trim())
                              void action("admin.unbind", { id: l.id, reason });
                          }}
                        >
                          解除綁定
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page === "experience" ? (
          <Experience
            versions={versions}
            save={(levels) => action("admin.experience", levels)}
            busy={busy}
          />
        ) : (
          !(page === "users" ? users.length : licenses.length) && (
            <div className="empty">
              尚無{page === "users" ? "使用者" : "授權碼"}。
            </div>
          )
        )}
      </section>
      {creating && (
        <Dialog
          title={page === "users" ? "新增使用者" : "建立授權碼"}
          close={() => setCreating(false)}
        >
          <form onSubmit={submit} className="form-stack">
            {page === "users" ? (
              <>
                <Field label="顯示名稱">
                  <input name="name" required maxLength={60} />
                </Field>
                <Field label="電子郵件">
                  <input name="email" type="email" required />
                </Field>
                <Field label="初始密碼（至少12字元）">
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </Field>
              </>
            ) : (
              <Field label="授權使用者">
                <select name="user_id" required>
                  <option value="">請選擇</option>
                  {users
                    .filter((u) => u.enabled)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "處理中…" : "確認建立"}
            </button>
          </form>
        </Dialog>
      )}
      {code && (
        <Dialog title="授權碼已建立" close={() => setCode("")}>
          <p>完整授權碼只顯示這一次，請安全交給對應使用者。</p>
          <code className="license-code">{code}</code>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(code)
                .then(() => setMessage("授權碼已複製。"))
                .catch(() => setError("無法使用剪貼簿，請手動複製。"))
            }
          >
            複製授權碼
          </button>
        </Dialog>
      )}
    </>
  );
}
function Experience({
  versions,
  save,
  busy,
}: {
  versions: { id: string; name: string; created_at: string }[];
  save: (v: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [orientation, setOrientation] = useState<"rows" | "columns">("rows"),
    [text, setText] = useState(""),
    [levels, setLevels] = useState<Record<number, string> | null>(null),
    [error, setError] = useState(""),
    [name, setName] = useState("");
  function preview() {
    try {
      setLevels(
        parseLevels(
          text
            .trim()
            .split(/\r?\n/)
            .map((r) => r.trim().split(/[\t, ]+/)),
          orientation,
        ),
      );
      setError("");
    } catch (e) {
      setLevels(null);
      setError((e as Error).message);
    }
  }
  async function importExcel(file: File | undefined) {
    if (!file) return;
    setLevels(null);
    try {
      const { readLevels } = await import("../lib/excel");
      setLevels(await readLevels(file, orientation));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="form-stack padded">
      <p className="muted">
        每級所需經驗是「本級升到下一級」的數值。每次儲存會建立新版本，舊紀錄不受影響。
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="form-grid">
        <Field label="版本名稱">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：經典版 2026-09"
            maxLength={60}
          />
        </Field>
        <Field label="匯入排列">
          <select
            value={orientation}
            onChange={(e) => {
              setOrientation(e.target.value as "rows" | "columns");
              setLevels(null);
            }}
          >
            <option value="rows">橫向兩列：第一列等級，第二列所需經驗</option>
            <option value="columns">直向兩欄：左側等級，右側所需經驗</option>
          </select>
        </Field>
      </div>
      <Field label="貼上數值（逗號或Tab分隔，不含標題列）">
        <textarea
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setLevels(null);
          }}
          placeholder={
            orientation === "rows" ? "1,2,3\n15,34,57" : "1,15\n2,34\n3,57"
          }
        />
      </Field>
      <div className="actions">
        <button onClick={preview}>預覽貼上內容</button>
        <label className="button">
          <Upload size={18} />
          匯入 Excel
          <input
            aria-label="匯入 Excel"
            type="file"
            accept=".xlsx"
            onChange={(e) => void importExcel(e.target.files?.[0])}
          />
        </label>
      </div>
      {levels && (
        <>
          <p>已讀取 {Object.keys(levels).length} 個等級（預覽前8筆）</p>
          <table>
            <thead>
              <tr>
                <th>等級</th>
                <th>所需經驗</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(levels)
                .slice(0, 8)
                .map(([l, v]) => (
                  <tr key={l}>
                    <td>{l}</td>
                    <td>{number(v)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <button
            className="primary"
            disabled={!name.trim() || busy}
            onClick={() => save({ name: name.trim(), levels })}
          >
            確認並建立新版本
          </button>
        </>
      )}
      <h2>歷史版本</h2>
      {versions.length ? (
        versions.map((v) => (
          <div className="version" key={v.id}>
            <span>{v.name}</span>
            <small>{new Date(v.created_at).toLocaleDateString("zh-TW")}</small>
          </div>
        ))
      ) : (
        <p className="muted">尚無經驗表；請先匯入，才能結算經驗收益。</p>
      )}
    </div>
  );
}
