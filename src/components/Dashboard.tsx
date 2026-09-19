import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Search } from "lucide-react";
import { api, demo, type SessionRow, type Summary } from "../lib/api";
import { demoRows, demoSummary } from "../lib/demo";
import { duration, number, perTen } from "../lib/math";
import { Dialog, Notice } from "./UI";
export function Dashboard() {
  const [maps, setMaps] = useState<Summary[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [search, setSearch] = useState(""),
    [expanded, setExpanded] = useState(""),
    [detail, setDetail] = useState<SessionRow | null>(null),
    [revision, setRevision] = useState(0);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setMaps(demo ? demoSummary : await api<Summary[]>("summaries"));
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <>
      <div className="toolbar">
        <span className="muted">
          工作台 <span className="slash">/</span> 數據統計
        </span>
        <button onClick={refresh} disabled={busy}>
          <RefreshCw size={18} className={busy ? "spin" : ""} />
          重新整理
        </button>
      </div>
      {demo && (
        <Notice>本機設計預覽 · 以下均為示範資料，不代表已連上資料庫。</Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      <section className="metrics" aria-label="總覽">
        <div>
          <span>紀錄筆數</span>
          <strong>{maps.reduce((a, m) => a + m.count, 0)}</strong>
        </div>
        <div>
          <span>有效運行</span>
          <strong>{duration(maps.reduce((a, m) => a + m.seconds, 0))}</strong>
        </div>
        <div>
          <span>地圖數量</span>
          <strong>{maps.length}</strong>
        </div>
      </section>
      <section className="panel">
        <header className="panel-title">
          <h1>地圖紀錄</h1>
          <label className="search">
            <Search size={21} />
            <input
              aria-label="搜尋地圖"
              placeholder="搜尋地圖…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </header>
        {maps
          .filter((m) => m.map.includes(search.trim()))
          .map((m) => (
            <div key={m.map}>
              <button
                className="map-row"
                aria-expanded={expanded === m.map}
                onClick={() => setExpanded(expanded === m.map ? "" : m.map)}
              >
                {expanded === m.map ? <ChevronDown /> : <ChevronRight />}
                <span className="map-name">
                  {m.map}
                  <small>{m.count} 筆紀錄</small>
                </span>
                <span className="rate">
                  <small>EXP / 10 分鐘</small>
                  <strong>{number(perTen(m.exp, m.seconds))}</strong>
                </span>
                <span className="rate">
                  <small>楓幣 / 10 分鐘</small>
                  <strong>{number(perTen(m.mesos, m.seconds))}</strong>
                </span>
              </button>
              {expanded === m.map && (
                <MapRows key={revision} map={m.map} onDetail={setDetail} />
              )}
            </div>
          ))}
        {!busy && !maps.some((m) => m.map.includes(search.trim())) && (
          <div className="empty">
            {search
              ? "沒有符合的地圖。"
              : "尚無紀錄。完成桌面端結算後，紀錄會顯示在這裡。"}
          </div>
        )}
        {busy && <div className="empty">讀取紀錄中…</div>}
      </section>
      <p className="footnote">
        人工填報。經驗值依等級百分比估算；楓幣與道具為淨變化。每 10 分鐘依總收益
        ÷ 總有效時間計算。
      </p>
      {detail && (
        <Dialog title="紀錄詳情" close={() => setDetail(null)}>
          <dl className="details">
            <dt>地圖／職業</dt>
            <dd>
              {detail.map} · {detail.profession}
            </dd>
            <dt>有效運行</dt>
            <dd>{duration(detail.seconds)}</dd>
            <dt>經驗淨變化（估算）</dt>
            <dd>{number(detail.exp)}</dd>
            <dt>楓幣淨變化</dt>
            <dd>{number(detail.mesos)}</dd>
            {detail.items.map((i) => (
              <div key={i.name} className="detail-item">
                <dt>{i.name}</dt>
                <dd>
                  {number(i.delta)}{" "}
                  <small>
                    ／每10分 {number(perTen(i.delta, detail.seconds))}
                  </small>
                </dd>
              </div>
            ))}
            <dt>備註</dt>
            <dd>{detail.notes || "—"}</dd>
          </dl>
        </Dialog>
      )}
    </>
  );
}
function MapRows({
  map,
  onDetail,
}: {
  map: string;
  onDetail: (r: SessionRow) => void;
}) {
  const [rows, setRows] = useState<SessionRow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError("");
    (demo
      ? Promise.resolve(demoRows.filter((r) => r.map === map))
      : api<SessionRow[]>("sessions", { map, page })
    )
      .then((data) => {
        if (alive) {
          setRows(data);
          setMore(data.length === 20);
        }
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [map, page]);
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "日期",
                "職業",
                "等級",
                "有效時間",
                "EXP / 10 分",
                "楓幣 / 10 分",
                "詳情",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {new Date(r.ended_at).toLocaleString("zh-TW", {
                    hour12: false,
                  })}
                </td>
                <td>{r.profession}</td>
                <td>{r.end_level}</td>
                <td>{duration(r.seconds)}</td>
                <td className="positive">{number(perTen(r.exp, r.seconds))}</td>
                <td className="positive">
                  {number(perTen(r.mesos, r.seconds))}
                </td>
                <td>
                  <button
                    className="icon"
                    aria-label={`查看 ${r.profession} 紀錄`}
                    onClick={() => onDetail(r)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {busy && <div className="empty">讀取中…</div>}
      <div className="pagination">
        <button
          disabled={page === 0 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          上一頁
        </button>
        <span>第 {page + 1} 頁</span>
        <button disabled={!more || busy} onClick={() => setPage((p) => p + 1)}>
          下一頁
        </button>
      </div>
    </>
  );
}
