import type { SessionRow, Summary } from "./api";
export const demoRows: SessionRow[] = [
  {
    id: "demo-1",
    map: "黑肥肥領土 II",
    profession: "牧師",
    end_level: 41,
    ended_at: "2026-09-19T10:30:00+08:00",
    seconds: 8280,
    exp: "1771920",
    mesos: "471960",
    notes: "示範資料，不會上傳。",
    items: [
      { name: "白色藥水", delta: "-24" },
      { name: "黑肥肥之牙", delta: "136" },
    ],
  },
  {
    id: "demo-2",
    map: "黑肥肥領土 II",
    profession: "戰士",
    end_level: 40,
    ended_at: "2026-09-18T17:05:00+08:00",
    seconds: 6420,
    exp: "1311820",
    mesos: "340260",
    notes: "示範資料",
    items: [],
  },
  {
    id: "demo-3",
    map: "迷霧森林",
    profession: "法師",
    end_level: 24,
    ended_at: "2026-09-18T10:18:00+08:00",
    seconds: 11460,
    exp: "1876002",
    mesos: "408740",
    notes: "示範資料",
    items: [],
  },
  {
    id: "demo-4",
    map: "武器庫",
    profession: "弓箭手",
    end_level: 70,
    ended_at: "2026-09-17T10:18:00+08:00",
    seconds: 7200,
    exp: "915600",
    mesos: "226800",
    notes: "示範資料",
    items: [],
  },
];
export const demoSummary: Summary[] = [
  ...new Set(demoRows.map((r) => r.map)),
].map((map) => {
  const rows = demoRows.filter((r) => r.map === map);
  return {
    map,
    count: rows.length,
    seconds: rows.reduce((a, r) => a + r.seconds, 0),
    exp: String(rows.reduce((a, r) => a + Number(r.exp), 0)),
    mesos: String(rows.reduce((a, r) => a + Number(r.mesos), 0)),
  };
});
