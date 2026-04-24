# 🍽️ 今天吃什麼？ (eatwhat)

一個零設定、純前端的「找附近餐廳」Web App。打開網頁、點一下定位，就會列出附近的餐廳，還可以按料理類型篩選、隨機幫你抽一間。

## ✨ 特色

- **一鍵定位**：使用瀏覽器 Geolocation API 取得目前位置
- **多樣料理篩選**：日式、韓式、燒肉、火鍋、早餐、中式、台式、美式、義式、泰式、越式、咖啡、甜點、速食、印度、墨式、海鮮、蔬食…
- **可調搜尋半徑**：500 m / 1 km / 2 km / 3 km / 5 km
- **隨機抽一間**：選擇障礙救星 🎲
- **顯示距離與地址**，一鍵開啟 Google 地圖導航
- **無需 API key**：資料來自 OpenStreetMap 透過 Overpass API
- **支援深色模式**、行動裝置友善
- **純靜態檔案**：HTML/CSS/JS，沒有 build step、沒有後端

## 🚀 使用方式

直接打開 `index.html` 即可，或用任一靜態伺服器：

```bash
# Python 3
python3 -m http.server 8080

# 或 Node (需要 npx)
npx serve .
```

然後用瀏覽器開啟 <http://localhost:8080>。

> ⚠️ 現代瀏覽器要求在 HTTPS 或 `localhost` 下才會授予定位權限。直接用 `file://` 打開可能無法定位。

## ☁️ 部署到 Vercel

這是純靜態網站，Vercel 會自動偵測（無 build step、無 framework preset），部署後即自動取得 HTTPS（Geolocation API 必備條件）。

### 方式 A：GitHub 連動（推薦）

1. 前往 <https://vercel.com/new>
2. 選擇 `cachuang/eatwhat` repository 匯入
3. Framework Preset 保留 **Other**（靜態站）、其他欄位留空
4. 按 **Deploy**，完成後會拿到 `https://<project>.vercel.app`

之後每次 push 到 `main` 會自動更新正式環境，push 到其他分支會產生 Preview URL。

### 方式 B：Vercel CLI

```bash
# 安裝 CLI（只需一次）
npm i -g vercel

# 在專案根目錄執行
vercel            # 第一次會引導綁定 project，產出 preview 連結
vercel --prod     # 部署到正式環境
```

### 設定檔說明

`vercel.json` 已配置：
- **安全 headers**：`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy: geolocation=(self)` 等
- **快取策略**：`index.html` 每次重新驗證（確保更新即時生效），`css/js/圖片` 快取 1 小時
- `cleanUrls` / `trailingSlash: false`

如需自訂網域，至 Vercel Dashboard → Project → **Settings → Domains** 新增即可。

## 🗂️ 專案結構

```
eatwhat/
├─ index.html     # 頁面結構
├─ styles.css     # 樣式（含深色模式）
├─ app.js         # 定位、查詢、篩選、渲染
├─ vercel.json    # Vercel 部署設定（headers、cache）
├─ .gitignore
└─ README.md
```

## 🔧 如何新增料理類型

編輯 `app.js` 最上方的 `CUISINE_FILTERS` 陣列，新增一筆：

```js
{ id: "french", label: "法式", emoji: "🥖", match: ["french"] }
```

`match` 內填 OSM `cuisine` tag 會出現的關鍵字（小寫、底線格式）。

## 📡 資料來源

- [OpenStreetMap](https://www.openstreetmap.org) — 由全球貢獻者共同維護的開放地圖資料
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) — 查詢 OSM 資料的公開 API

App 會依序嘗試多個 Overpass 鏡像站，盡量避免單點故障。

## 📝 License

MIT
