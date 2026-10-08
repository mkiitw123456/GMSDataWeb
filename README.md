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

### 2026-10-08：帳號與授權碼管理

- 新增會員只填「登入帳號、顯示名稱、密碼」，不用提供 Email。帳號 1–40 字、中英文／數字／`_.-`，NFKC 正規化且英文不分大小寫，資料庫唯一索引防重複。
- 擁有者可編輯一般使用者帳號、名稱及密碼；新密碼留空代表不修改。改名不改 UUID，已有授權碼及統計繼續屬於同一使用者。擁有者自己的登入方式不在這個介面修改。
- 舊 Email 帳號不強制遷移，仍可用原本 Email 登入。一般會員在後台設定帳號／新密碼後，請改用該登入帳號。
- 密碼依產品需求允許 1–200 字元，但單字元密碼極易被猜中，**不建議使用**。公開 `auth.login` 每 IP 10 次／分鐘、每帳號 5 次／分鐘（固定視窗，不是不可暴力破解保證）。前端不保留密碼、不記錄請求密碼。
- Supabase 仍管理登入 session 與密碼雜湊；新帳號使用隨機 UUID 的內部 `.invalid` Email 識別，不寄信、不需要使用者郵箱。伺服器將原密碼以 `LICENSE_PEPPER`、UUID、獨立用途字串做 HMAC，再交給 Supabase；不把原密碼補字元或只在前端忽略最短限制。Supabase 只儲存雜湊。**請勿更換或遺失 LICENSE_PEPPER**，否則既有授權碼及新版網站密碼都受影響。HMAC 不會讓弱密碼變成強密碼。
- 刪除授權碼有二次確認；交易內刪除授權、challenge、device session，保留安全稽核與歷史統計。桌面程式下次向後端驗證（正常約 30 秒）會被拒絕。刪除不是停用，不能復原成原碼。
- 新管理 API 必須有擁有者的網站登入 JWT；設備 token 不得呼叫管理 API。密碼更新與 profile 更新跨 Auth/資料庫 API，若 profile 儲存失敗但密碼已變更，會明確回傳部分成功訊息，不假裝全部失敗。

更新既有雲端時：先備份／比對現行 portal 原始碼，再只執行 `supabase/migrations/202610080001_account_management.sql`（一次；不要重跑初始 SQL），部署 `portal`，最後部署 Vercel 前端。新增欄位 nullable，不修改任何既有密碼或授權碼。若原專案透過 SQL Editor 建立而没有 CLI migration history，請勿直接對其執行會重跑初始建表的 `db push`。

驗證：`npm test`、`npm run build`、`deno check --node-modules-dir=none --no-lock supabase/functions/portal/index.ts`。後端單元測試使用假的 Auth/PostgREST，不代表雲端連線已通過；上線時另做臨時帳號的真實登入／改密碼／刪碼撤銷測試。

資料表全面RLS/預設deny；前端只能透過API讀取經伺服器挑選的資料。一般登入者看全部統計，不看設備、Email或授權資料。無公開註冊；即使有人建立Auth帳號，沒有有效profile仍不能用服務。管理員由伺服器role決定，不信任user_metadata。

授權碼為32bytes隨機值，伺服器只存帶pepper的HMAC。設備Ed25519簽章、一次性2分鐘challenge、15分鐘設備session；首次綁定row lock，拒絕跨設備重用。MAC與MachineGuid摘要輔助綁定，Windows DPAPI保護本機private key。這不是不可破解DRM。備份pepper，丟失後舊碼不能再啟用。

結算以UUID+payload hash冪等，伺服器重算跨級EXP、楓幣及道具淨差。經驗表不可覆寫舊版本。收益用numeric / Decimal；介面傳字串避免JS大整數誤差。有效時間由桌面端提供，並非反作弊可信計量。

摘要交易增量更新；明細每頁20筆、手動刷新，沒有Realtime或秒級輪詢。無圖片/影片存儲，Excel在瀏覽器本機解析、只送數字JSON。限制檔案1MB、等級1000筆、道具100筆、API64KB。公式不應作為經驗表資料，請匯出純數值。

## 驗證範圍

雲端正式啟用前需測：Owner/member/未登入權限、兩台同碼競態、challenge重播、帳號停用、結算重送、跨級缺表、Excel方向。沒有連上正式Supabase的本機測試不能代表上述雲端測試已通過。
