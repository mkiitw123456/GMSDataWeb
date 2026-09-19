# GMS Data

私人遊戲紀錄入口：React/Vite + Supabase Auth/Postgres/Edge Functions。Vercel 只部署前端。統計為人工填報，沒有遊戲封包或OCR讀取。

## 本機

`npm ci` → 複製 `.env.example` 為 `.env.local`，設定 Supabase URL / publishable key → `npm run dev`。

只有開發伺服器的 `/?demo=1` 提供明確標示的視覺預覽。正式 build 不啟用 demo。`npm test` 與 `npm run build` 執行驗證。

## 雲端部署順序

1. 建立自己的 Supabase 免費專案，關閉公開註冊（Authentication → Sign In / Providers）。所有表預設不對 anon/authenticated 授權。
2. 使用 Supabase CLI `supabase link --project-ref <ref>`、`supabase db push` 套用 migrations。或在空專案 SQL Editor 執行 migration。勿重複執行已套用的初始檔。
3. 在 Auth 後台由擁有者建立自己的帳號，然後在 SQL Editor 用該帳號 UUID 執行：`insert into public.profiles(id,name,role) values ('實際UUID','Owner','owner');`。不提供「第一個註冊自動管理員」或網頁提權接口。
4. Edge Function Secrets 設定 `LICENSE_PEPPER`（至少32bytes隨機秘密）、`ALLOWED_ORIGINS`（正式網站origin，測試時可加 `http://127.0.0.1:5173`，逗號分隔）、可選 `DISCORD_SECURITY_WEBHOOK`。不可提交到Git。內建 `SUPABASE_SERVICE_ROLE_KEY` 僅供Edge使用。
5. `supabase functions deploy portal --no-verify-jwt`。入口會自行驗證 Auth JWT（getUser）或設備簽章／有限期token；不以關閉平台JWT等同允許匿名操作。
6. Vercel 匯入 GMSDataWeb repo，Vite preset；環境變數只放 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`，不可放service key或pepper。部署後把正式origin加入ALLOWED_ORIGINS。
7. 在網站用Owner帳號登入，建立會員與授權碼，匯入實際經驗表。把授權碼私下交給對應使用者。

## 安全與計量

資料表全面RLS/預設deny；前端只能透過API讀取經伺服器挑選的資料。一般登入者看全部統計，不看設備、Email或授權資料。無公開註冊；即使有人建立Auth帳號，沒有有效profile仍不能用服務。管理員由伺服器role決定，不信任user_metadata。

授權碼為32bytes隨機值，伺服器只存帶pepper的HMAC。設備Ed25519簽章、一次性2分鐘challenge、15分鐘設備session；首次綁定row lock，拒絕跨設備重用。MAC與MachineGuid摘要輔助綁定，Windows DPAPI保護本機private key。這不是不可破解DRM。備份pepper，丟失後舊碼不能再啟用。

結算以UUID+payload hash冪等，伺服器重算跨級EXP、楓幣及道具淨差。經驗表不可覆寫舊版本。收益用numeric / Decimal；介面傳字串避免JS大整數誤差。有效時間由桌面端提供，並非反作弊可信計量。

摘要交易增量更新；明細每頁20筆、手動刷新，沒有Realtime或秒級輪詢。無圖片/影片存儲，Excel在瀏覽器本機解析、只送數字JSON。限制檔案1MB、等級1000筆、道具100筆、API64KB。公式不應作為經驗表資料，請匯出純數值。

## 驗證範圍

雲端正式啟用前需測：Owner/member/未登入權限、兩台同碼競態、challenge重播、帳號停用、結算重送、跨級缺表、Excel方向。沒有連上正式Supabase的本機測試不能代表上述雲端測試已通過。
