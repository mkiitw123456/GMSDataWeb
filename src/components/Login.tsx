import { useState, type FormEvent } from "react";
import { api, supabase } from "../lib/api";
import { Field, Notice } from "./UI";
export function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const tokens = await api<{ access_token: string; refresh_token: string }>(
        "auth.login",
        {
          username: String(fd.get("username")),
          password: String(fd.get("password")),
        },
      );
      const { error } = await supabase.auth.setSession(tokens);
      if (error) throw error;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="brand">
        GMS <span>Data</span>
      </div>
      <form onSubmit={submit} className="panel login-form">
        <h1>登入工作台</h1>
        <p className="muted">使用管理員為你建立的帳號。</p>
        {!supabase && <Notice>尚未連接雲端服務，登入功能暫不可用。</Notice>}
        {error && <Notice error>{error}</Notice>}
        <Field label="登入帳號">
          <input
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
          />
        </Field>
        <small className="muted">
          新帳號不需要 Email；舊帳號仍可輸入原本的 Email。
        </small>
        <Field label="密碼">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={1}
            maxLength={200}
          />
        </Field>
        <button className="primary" disabled={!supabase || busy}>
          {busy ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
