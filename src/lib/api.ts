import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const demo =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("demo") === "1";
export async function api<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error("尚未連接 Supabase，請完成環境設定。");
  const { data, error } = await supabase.functions.invoke("portal", {
    body: { action, ...payload },
  });
  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      message = body?.error || message;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export type Profile = {
  id: string;
  name: string;
  username?: string | null;
  role: "owner" | "member";
  enabled: boolean;
};
export type Summary = {
  map: string;
  count: number;
  seconds: number;
  exp: string;
  mesos: string;
};
export type SessionRow = {
  id: string;
  map: string;
  profession: string;
  end_level: number;
  ended_at: string;
  seconds: number;
  exp: string;
  mesos: string;
  notes: string;
  items: { name: string; delta: string }[];
};
export type License = {
  id: string;
  user_id: string;
  suffix: string;
  enabled: boolean;
  bound: boolean;
  created_at: string;
};
