# IG 短影片 → 逐字稿 → NotebookLM / Claude 拆解

## 先講結論：原本的流程中間兩步走不通

你原本設想的是：

```
IG 影片 → 下載 → 上傳私密 YouTube → NotebookLM 分析 → Claude 拆解
```

其中「私密 YouTube → NotebookLM」這一段是斷的，原因有兩個：

1. **NotebookLM 的 YouTube 來源只吃「公開且有字幕」的影片。** 官方說明寫的是 only public
   YouTube videos with captions（使用者上傳或自動生成皆可）。設成私密的影片 NotebookLM
   讀不到；設成 unlisted 也普遍抓不到逐字稿。要讓它讀得到，你得把影片設成公開 —— 那就
   違背了你要「私密」的初衷。
2. **NotebookLM 沒有官方公開 API。** 到 2026 年為止只有企業版有 API，一般帳號沒有可用的
   端點，所以「自動把東西送進 NotebookLM」這一步沒辦法程式化，只能手動加來源。

而且就算硬繞過去，YouTube 那一圈也沒帶來額外資訊 —— NotebookLM 從 YouTube 拿到的其實
就是**字幕文字**，那份文字我們自己在本機轉一次就有了，還更快更準（可以指定中文模型）。

所以這個工具把流程改成：

```
IG 影片 → yt-dlp 下載 + metadata → Whisper 本機轉逐字稿
        → 打包成 Markdown → 手動拖進 NotebookLM（檔案上傳一定支援）
        → Claude 拆解
```

YouTube 那步保留成**選用的備份功能**，不再是分析路徑的一部分。

## 還有兩個現實限制要先知道

- **不能只給帳號名稱就自動抓全部影片。** yt-dlp 的 `instagram:user` 抽取器目前標記為
  CURRENTLY BROKEN，所以像 `@headhomeuni` 這樣一個帳號，沒辦法一行指令列出它所有 Reels。
  你得先自己蒐集貼文網址（做法見下）。
- **公開貼文不一定需要登入，但一定需要 `curl_cffi`。** 詳見下一節。私密帳號則無解 ——
  沒有任何工具或線上網站能繞過，你得先是被核准的追蹤者。
- **自動化抓取違反 IG 服務條款**，抓太快帳號會被限制。影片版權屬於原帳號，這套流程請當成
  個人研究／學習用途，不要轉載或再發布。建議放慢速度（預設每次請求間隔 3 秒）。

## 為什麼線上下載網站（sssinstagram 之類）不用登入就能抓

因為它們走的是 IG 的**匿名 GraphQL 端點** —— 而 yt-dlp 走的是同一條路，沒有誰有秘密管道。
從 yt-dlp 的 `instagram.py` 就看得出來：它會 POST 到 `www.instagram.com/api/graphql`，
帶上 `X-FB-Friendly-Name: PolarisLoggedOutDesktopWWWPostRootContentQuery`（名稱裡的
LoggedOut 就是「未登入」）與一組 `doc_id`，回傳的 `xig_polaris_media.if_not_gated_logged_out`
裡就有影片的 CDN 網址。拿到那個網址之後，檔案本身放在公開 CDN 上，一個普通 GET 就下載得到。

真正的差別只有兩個：

1. **TLS 指紋。** IG 會辨識連線的 TLS handshake 特徵，一般 Python HTTP 客戶端一看就是機器人。
   yt-dlp 對這條路徑全部標了 `impersonate=True`，但那需要 `curl_cffi` 才能生效 —— 沒裝的話
   `_can_impersonate` 是 False，整個匿名請求直接被跳過，最後 fallback 去抓網頁、被導去登入頁，
   然後你看到的錯誤訊息會是「已超過匿名存取貼文的速率限制」。**這就是多數人以為「一定要
   cookies」的真正原因。**
2. **IP 信譽與速率限制。** 匿名存取是按 IP 限流的。那些網站背後有輪替的代理 IP 池，你只有
   一個家用 IP，抓幾十支就會被擋。放慢速度、分批跑可以緩解。

所以：`pip install -r requirements.txt`（已經包含 `curl-cffi` extra）之後，公開帳號多半不用
cookies 就抓得到。抓到一半開始失敗就是撞到限流，隔一陣子再跑，或補上 `--cookies-from-browser`。

順帶一提，那些網站**也抓不到私密帳號** —— 它們用的是「未登入」端點，本來就只看得到公開內容。

### 那能不能乾脆都用那些網站下載就好？

幾支影片可以，做分析語料不行 —— 因為**你只會拿到一個 mp4，metadata 全部丟失**：觀看數、
按讚數、留言數、貼文文案、發布日期都沒有。而那些欄位正是後面 `pack` 出來的素材能拿來做
跨影片比較的依據（哪支表現好、開頭鉤子跟互動有沒有關係）。少了它們，NotebookLM 和 Claude
就只剩下逐字稿可看。加上要一支一支手貼、有廣告與人機驗證、部分站台還會轉檔壓畫質。

真的只能靠那些網站拿到影片的話，把 mp4 丟進 `work/`，`transcribe` 和 `pack` 仍然會處理它們
（見下方「手動放進來的影片」）。

## 安裝

```bash
cd ig-pipeline
pip install -r requirements.txt
# 需要 ffmpeg，macOS: brew install ffmpeg / Ubuntu: apt install ffmpeg
```

不做 YouTube 備份的話，`requirements.txt` 裡的兩個 google 套件可以不裝。

## 網頁介面（最省事的用法）

```bash
python webapp.py          # 然後開 http://127.0.0.1:8765
```

貼上網址 → 按開始 → 看即時進度 → 結果直接顯示 metadata 與逐字稿，底下三個按鈕可以複製
Markdown、複製「跨影片拆解提示詞＋素材」、或下載 `.md`。複製完直接貼進 Claude 或存成檔案
上傳 NotebookLM。

**這個網頁只能跑在你自己電腦上，不能放 GitHub Pages。** 純靜態頁面做不到抓取：瀏覽器的
CORS 會擋掉對 instagram.com 的請求，而且前面講的 TLS 指紋模擬與 IP 限流都必須在伺服器端
處理。`webapp.py` 就是那個伺服器，它只綁 `127.0.0.1`，不對外開放。

介面本身只是包住 `igpipe.py`，所以兩種用法產出的東西完全一樣，喜歡命令列就繼續用下面的
四個步驟。網頁端只接受 `/reel/…`、`/p/…`、`/tv/…` 這類單篇貼文網址，貼帳號首頁會被擋下來
並告訴你原因。

## 怎麼蒐集網址

`instagram:user` 壞掉，所以三選一：

1. **手動**：在 IG 開帳號的 Reels 頁，逐支複製網址貼進 `urls.txt`。幾十支以內最省事，也
   最不會觸發風控。
2. **瀏覽器 console**：在帳號頁滑到底後，抓出頁面上所有 `/reel/` 連結：
   ```js
   copy([...new Set([...document.querySelectorAll('a[href*="/reel/"]')]
     .map(a => new URL(a.href).origin + new URL(a.href).pathname))].join('\n'))
   ```
   結果會複製到剪貼簿，貼進 `urls.txt`。
3. **instaloader**：`pip install instaloader` 後可以列出整個 profile，但它需要登入、速度
   限制更嚴，帳號被鎖的風險比前兩種高。

## 四個步驟

```bash
cp urls.example.txt urls.txt   # 然後把真正的網址填進去

# 1. 下載影片與 metadata（觀看數、按讚數、文案、日期都會存進 .info.json）
#    公開帳號先試不帶 cookies；被限流或遇到私密帳號再加 --cookies-from-browser chrome
python igpipe.py fetch --urls urls.txt --skip-existing

# 2. 本機產生逐字稿（第一次會下載 Whisper 權重）
python igpipe.py transcribe --model small --lang zh

# 3. 打包成 NotebookLM 素材
python igpipe.py pack --dest notebooklm --single-file
```

`work/` 會放影片、`.info.json`、`.txt`、`.srt`；`notebooklm/` 會放每支一個 Markdown、一份
`_index.md` 總表，加上 `--single-file` 時還有一份合併的 `_all.md`。

每個 Markdown 長這樣：

```markdown
# headhomeuni / C1abc

- 來源網址：https://www.instagram.com/reel/C1abc/
- 發布日期：2026-07-14
- 影片長度：47 秒
- 互動數據：觀看 128,400、按讚 9,210、留言 183

## 貼文文案
...

## 影片逐字稿
...
```

metadata 寫成人看得懂的句子而不是 JSON，是因為 NotebookLM 要能引用到它。

### 手動放進來的影片

從線上下載站或別的地方拿到的 mp4，直接丟進 `work/` 就行，`transcribe` 和 `pack` 都會處理
（它們掃的是影片檔，不是 `.info.json`）。這類影片會在 `pack` 結束時被統計出來提醒你，輸出的
Markdown 只有逐字稿，metadata 欄位會是「未知」。檔名會被拿來當貼文 ID，所以取個看得懂的名字。

### 4.（選用）備份到 YouTube

只是想留一份雲端備份的話：

```bash
python igpipe.py upload --privacy unlisted --limit 6
```

需要先到 Google Cloud 開一個專案、啟用 YouTube Data API v3、建 OAuth client（桌面應用程式
類型），把 `client_secrets.json` 放在同目錄。

**配額提醒**：`videos.insert` 每支要 1600 units，而預設每日配額是 10,000 units，換算下來
**一天只能上傳 6 支**。`--limit` 預設就是 6，超過會停下來。已上傳的會記在
`work/uploaded.json`，隔天再跑會自動接續。未驗證的專案上傳的影片還會被強制鎖成私人。

再次提醒：這裡上傳的影片 NotebookLM 讀不到，這步純粹是備份。

## 送進 NotebookLM

1. 開一個新 notebook。
2. Add source → Upload files，把 `notebooklm/` 底下的 `.md` 全部拖進去。
   （單一 notebook 的來源數量有上限，超過的話改用 `_all.md` 這個合併檔。）
3. 問它跨影片的問題，它會標出處。

## 送進 Claude 拆解

`prompts/breakdown.md` 有現成的提示詞：單支影片拆解、跨影片模式分析，以及哪些問題適合留
給 NotebookLM 問。把 `notebooklm/` 底下的 Markdown 附上就能用。

實務上的分工是：**NotebookLM 負責在大量來源之間找出處與交叉比對，Claude 負責拆解結構與
產出新的東西。** 兩邊吃的是同一份 Markdown，不必二選一。
