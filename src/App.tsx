import { lazy, Suspense, useEffect, useState } from "react";
import {
  ChartNoAxesColumnIncreasing,
  KeyRound,
  Users,
  NotebookText,
  LogOut,
  UserRound,
} from "lucide-react";
import { api, demo, supabase, type Profile } from "./lib/api";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import type { AdminPage } from "./components/Admin";
const Admin = lazy(() =>
  import("./components/Admin").then((m) => ({ default: m.Admin })),
);
const labels = {
  licenses: "授權碼管理",
  users: "使用者管理",
  experience: "經驗值表",
};
import { Notice } from "./components/UI";
export function App() {
  const [profile, setProfile] = useState<Profile | null>(
      demo ? { id: "demo", name: "Owner", role: "owner", enabled: true } : null,
    ),
    [loading, setLoading] = useState(!demo && !!supabase),
    [error, setError] = useState(""),
    [page, setPage] = useState<"stats" | AdminPage>("stats");
  useEffect(() => {
    if (demo || !supabase) return;
    let alive = true;
    let revision = 0;
    const fetchProfile = async (session: unknown) => {
      const seq = ++revision;
      if (!session) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const p = await api<Profile>("me");
        if (alive && seq === revision) {
          setProfile(p);
          setError("");
        }
      } catch (e) {
        if (alive && seq === revision) {
          setProfile(null);
          setError((e as Error).message);
        }
      } finally {
        if (alive && seq === revision) setLoading(false);
      }
    };
    void supabase.auth
      .getSession()
      .then(({ data }) => fetchProfile(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void fetchProfile(session), 0);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  if (loading) return <div className="login muted">驗證登入狀態…</div>;
  if (!profile)
    return (
      <>
        {error && <Notice error>{error}</Notice>}
        <Login />
      </>
    );
  const nav = [
    {
      id: "stats" as const,
      label: "數據統計",
      icon: ChartNoAxesColumnIncreasing,
    },
    ...(profile.role === "owner"
      ? [
          { id: "licenses" as const, label: labels.licenses, icon: KeyRound },
          { id: "users" as const, label: labels.users, icon: Users },
          {
            id: "experience" as const,
            label: labels.experience,
            icon: NotebookText,
          },
        ]
      : []),
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          GMS <span>Data</span>
        </div>
        <nav aria-label="主要導覽">
          {nav.map(({ id, label, icon: Icon }, i) => (
            <div key={id}>
              {i === 1 && <p className="nav-label">系統管理</p>}
              <button
                className={`nav-link ${page === id ? "active" : ""}`}
                onClick={() => setPage(id)}
              >
                <Icon size={24} />
                {label}
              </button>
            </div>
          ))}
        </nav>
        <div className="account">
          <UserRound />
          <div>
            <strong>{profile.name}</strong>
            <small>{profile.role === "owner" ? "系統管理員" : "使用者"}</small>
          </div>
          <button
            className="icon"
            aria-label="登出"
            onClick={async () => {
              if (demo) {
                location.assign("/");
                return;
              }
              await supabase?.auth.signOut();
              setProfile(null);
              setPage("stats");
            }}
          >
            <LogOut size={19} />
          </button>
        </div>
      </aside>
      <main>
        <Suspense fallback={<div className="empty">載入管理頁…</div>}>
          {page === "stats" ? (
            <Dashboard />
          ) : profile.role === "owner" ? (
            <Admin page={page} />
          ) : null}
        </Suspense>
      </main>
    </div>
  );
}
