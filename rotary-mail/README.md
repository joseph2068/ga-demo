# 扶輪信件分類台

把指定 Gmail 帳號每天的信抓下來，依「地區活動／社長秘書／RI 國際扶輪／財務」自動標籤分類，
開頁、重整、按「更新」都會重新抓一次。可選擇把分類寫回 Gmail 成為真正的標籤。

純前端單頁：沒有後端、沒有資料庫。瀏覽器直接向 Google 要授權後打 Gmail API，
存取權杖只留在這台裝置的 `localStorage`，不會經過 Netlify 或任何第三方。

---

## 一、Google Cloud 設定（只做一次，約 5 分鐘）

1. 進 <https://console.cloud.google.com/> → 建立專案（名稱隨意，例如 `rotary-mail`）。
2. 左側「API 和服務 → 程式庫」→ 搜尋 **Gmail API** → **啟用**。
3. 「API 和服務 → OAuth 同意畫面」：
   - User Type 選 **外部**，填應用程式名稱、支援電子郵件。
   - 範圍那頁可以先跳過（程式會在登入時自己要求）。
   - **測試使用者**：把要讀信的帳號加進去，例如 `rctpedaylight0303@gmail.com`。
     停留在「測試」狀態即可，不必送審。
4. 「API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID」：
   - 應用程式類型：**網頁應用程式**
   - **已授權的 JavaScript 來源**：加入部署後的網址，例如
     - `https://你的站台名稱.netlify.app`
     - 本機測試再加 `http://localhost:8080`
   - 「已授權的重新導向 URI」不用填（這裡用的是不需重新導向的權杖流程）。
5. 複製產生的 **用戶端 ID**（`xxxx.apps.googleusercontent.com`）。

> 「測試」狀態下，授權大約每 7 天會失效一次，頁面會提示重新登入，按一下即可。
> 想免掉這件事就把應用程式發布並送 Google 驗證（Gmail 屬於受限範圍，需要審核）。

---

## 二、部署到 Netlify

**做法 A — 連 GitHub（建議，之後 push 就自動更新）**

1. <https://app.netlify.com/> → **Add new site → Import an existing project** → 選 GitHub。
2. 選 `joseph2068/ga-demo`，分支選 `claude/gmail-auto-categorize-webpage-qxyt6x`（合併後改成 `master`）。
3. Build command 留空、Publish directory 填 `rotary-mail`
   （倉庫根目錄的 `netlify.toml` 已經設好，通常會自動帶入）。
4. Deploy。拿到網址後，回 Google Cloud 憑證把該網址加進「已授權的 JavaScript 來源」。

**做法 B — 拖拉上傳**

把 `rotary-mail` 這個資料夾直接拖到 Netlify 的 **Sites** 頁面即可。

---

## 三、第一次使用

1. 打開網站 → 右上「⚙️ 設定」→ 貼上 **用戶端 ID** → 儲存。
2. 跳出 Google 登入視窗，選 `rctpedaylight0303@gmail.com` → 允許讀取 Gmail。
3. 之後每次開頁／重整／按「更新」都會重抓，權杖過期會自動續期。

想省掉第 1 步：把用戶端 ID 寫進 `rotary-mail/config.js` 的 `clientId` 再部署，
所有人打開就直接是登入畫面。用戶端 ID 出現在前端是正常的，真正的防線是
Google 憑證上的來源白名單。

---

## 四、分類怎麼判定

每封信取 **主旨 / 寄件者 / 內文摘要** 去比對各分類的關鍵字，加權計分：

| 命中位置 | 權重 |
| --- | --- |
| 主旨 | 3 |
| 寄件者姓名、信箱、List-Id | 2 |
| 內文摘要 | 1 |

分數最高的當主要分類；其他分數達到首位一半以上的，會以淡色次要標籤一併顯示，
所以一封「地區年會繳費通知」可以同時掛上「地區活動」和「財務」。都沒命中就歸「其他」。
標籤上的小字是實際命中的關鍵字，方便你判斷分類準不準。

英數關鍵字會卡字界（`RI` 不會在 `PRICE` 裡誤判），中文關鍵字直接比對包含。

關鍵字在「設定」裡可以直接改，存在瀏覽器本機，按「還原預設關鍵字」可回到出廠值。
要調整分類名稱或新增分類，改 `index.html` 裡的 `DEFAULT_CATS`
（新增分類記得在 CSS 一併加上 `--c-你的id` 與 `--c-你的id-bg` 兩個顏色變數）。

---

## 五、寫回 Gmail 標籤（選用）

設定裡勾「允許寫回 Gmail 標籤」→ 重新授權（權限範圍從唯讀改成可修改）→
工具列會出現「🏷 寫回 Gmail」。按下去會建立 `扶輪/地區活動`、`扶輪/財務` 這類巢狀標籤，
並套用到目前抓到的信件上。只加標籤，不會移動、封存或刪除任何信件。

---

## 六、其他

- **期間**：今天 / 昨天到今天 / 近 3、7、14、30 天，換選項就立刻重抓。
- **搜尋框**：在已抓下來的結果裡即時篩選，不會再打 API。
- **CSV**：匯出目前畫面上的信件（含分類欄位），UTF-8 with BOM，Excel 直接開不會亂碼。
- **進階查詢**：設定裡的「額外 Gmail 查詢條件」會併進 Gmail 搜尋語法，
  例如 `from:rotary.org`、`-from:noreply@`、`has:attachment`。
- **抓取上限**：預設 200 封，可調到 1000。信件只讀取標頭與摘要，不會下載附件或全文。

### 本機測試

```bash
cd rotary-mail && python3 -m http.server 8080
```

然後開 <http://localhost:8080>（記得把這個來源也加進 Google 憑證白名單）。
