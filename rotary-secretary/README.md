# 扶輪社秘書 · 例會應帶清單與交接單

單一檔案的靜態網頁（`index.html`），不需要任何建置流程或後端。
所有勾選狀態與交接單欄位都存在使用者自己的瀏覽器（localStorage），不會上傳。

## 功能

1. **例會應帶清單** — 大鐘、鐘錘、小鐘、四大考驗旗、社旗、活動旗、手拉旗、來賓簽到單印製、
   社內簽到單 QR code、講師費領據、講師桌牌印製。逐項打勾、顯示進度與尚缺項目。
2. **交接事項** — 秘書無法出席時的五個步驟（確認代理人 → 點交拍照 → 會前定位 →
   活動旗會後轉交下一場活動負責人 → 歸還與回報），以及每項物品該交給誰。
3. **交接單** — 填寫例會資訊與交接對象後，可列印／存成 PDF 簽名，或一鍵複製成文字貼到 LINE 群組。

## 部署到 Netlify

### 方法 A：連結 GitHub（建議，之後 push 就自動更新）

1. Netlify → **Add new site → Import an existing project → GitHub**，選這個 repo。
2. Build command 留空，**Publish directory 填 `.`**（根目錄設定已寫在 `netlify.toml`）。
3. Deploy。網址為 `https://<你的站名>.netlify.app/rotary-secretary/`，
   也可用短網址 `https://<你的站名>.netlify.app/rotary`。

> 若只想部署這個秘書工具、不要首頁的職缺分析器：
> Publish directory 改填 `rotary-secretary`，並把根目錄的 `netlify.toml` 刪掉或改成
> `publish = "rotary-secretary"`，網址就會是 `https://<你的站名>.netlify.app/`。

### 方法 B：拖拉上傳（最快，30 秒）

把 `rotary-secretary` 資料夾直接拖到 <https://app.netlify.com/drop>，馬上就有網址。

## 修改項目

要增刪例會物品，只要改 `index.html` 裡的 `ITEMS` 陣列：

```js
{ id:'flag-club', cat:'旗幟', name:'社旗',
  hint:'立於主桌／講台側，交換旗時亦需使用。',
  handTo:'代理秘書（若當天有交換旗，交司儀）' }
```

`cat` 需為 `鐘具`／`旗幟`／`文書印製` 其中之一（要新增類別請一併加到 `CATS`）。
