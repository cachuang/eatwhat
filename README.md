# 🍽️ 今天吃什麼？ (eatwhat)

一個「找附近餐廳」的 Web App。使用瀏覽器定位，透過 **Google Maps Places API (New)** 搜尋附近餐廳，顯示評分、照片、距離、營業狀態，並支援多種料理類型篩選、隨機抽籤。

## ✨ 特色

- **一鍵定位**：Geolocation API 取得目前位置
- **Google Maps 資料**：餐廳名稱、照片、評分（⭐ 星等 + 評論數）、價位、營業中/休息中
- **多樣料理篩選**：日式、韓式、燒肉、火鍋、早餐、中式、台式、美式、義式、泰式、越式、咖啡、甜點、速食、印度、墨式、海鮮、蔬食
- **可調搜尋半徑**：500 m / 1 km / 2 km / 3 km / 5 km
- **🎲 隨機抽一間**：選擇障礙救星
- **一鍵開啟 Google 地圖**（使用 Google 官方的 `googleMapsUri`）
- **支援深色模式**、行動裝置友善
- **API key 不外洩**：透過 Vercel Serverless Function 代理，瀏覽器看不到你的金鑰

## 🏗️ 架構

```
Browser ──► /api/places/search ──► Google Places API (searchNearby)
        ──► /api/places/photo  ──► Google Places API (photo media) ──► 302 redirect 到 Google CDN
```

- 前端：純靜態 HTML/CSS/JS
- 後端：Vercel Serverless Functions（Node 20，原生 `fetch`，無外部套件）
- API key 僅存在於 Serverless 環境，**不會** 傳到瀏覽器

## 🔑 Google Cloud 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)，建立或選擇一個專案
2. **啟用 Places API (New)**：
   - APIs & Services → Library → 搜尋 **"Places API (New)"** → Enable
   - ⚠️ 是 "Places API (**New**)" 不是舊版 "Places API"
3. **建立 API 金鑰**：
   - APIs & Services → Credentials → Create credentials → API key
4. **建議的金鑰限制**：
   - **Application restrictions**：選 **"None"**（因為是從 Vercel 伺服器呼叫，IP 會變動；若要鎖可用 Vercel Secure Compute 的固定 IP）
   - **API restrictions**：選 **"Restrict key"** → 只勾 **Places API (New)**
5. **啟用 billing**：Google Cloud 需要綁定付款方式，Places API (New) 有每月免費額度，超過才計費

> 💸 **費用提醒**：Nearby Search 約 US$0.032/次（Essentials SKU，2025 定價），Place Photo 約 US$0.007/次，請依 Google Maps 最新費率確認。第一次用會有免費額度，日常小流量通常免費。

## ⚙️ 環境變數

| 變數 | 說明 |
|---|---|
| `GOOGLE_MAPS_API_KEY` | 上一步建立的 API 金鑰 |

### 本機開發

```bash
cp .env.example .env.local
# 編輯 .env.local 填入金鑰
npm i -g vercel
vercel dev              # 啟動本地 Vercel 環境（會自動讀 .env.local）
# 開 http://localhost:3000
```

> `vercel dev` 是必要的，因為要跑 Serverless Function。用 `python3 -m http.server` 之類的靜態伺服器無法呼叫 `/api/*`。

### Vercel 正式部署

1. 先透過 GitHub 連動匯入或用 CLI `vercel` 部署一次
2. 到 **Project → Settings → Environment Variables** 新增 `GOOGLE_MAPS_API_KEY`
3. 三種 Environment（Production / Preview / Development）都建議加
4. 重新部署（或下次 push 自動觸發）

## 🚀 部署到 Vercel

### 方式 A：GitHub 連動（推薦）

1. 前往 <https://vercel.com/new>
2. 匯入 `cachuang/eatwhat`
3. Framework Preset 保留 **Other**（靜態 + Functions，Vercel 自動偵測）
4. 在 **Environment Variables** 加入 `GOOGLE_MAPS_API_KEY`
5. Deploy → 完成後取得 `https://<project>.vercel.app`

### 方式 B：Vercel CLI

```bash
npm i -g vercel
vercel                  # 第一次會引導設定
vercel env add GOOGLE_MAPS_API_KEY
vercel --prod
```

## 🗂️ 專案結構

```
eatwhat/
├─ index.html                    # 頁面結構
├─ styles.css                    # 樣式（含深色模式）
├─ app.js                        # 前端邏輯
├─ api/
│  └─ places/
│     ├─ search.js               # Serverless：Nearby Search 代理
│     └─ photo.js                # Serverless：照片 URL 代理（302 redirect）
├─ vercel.json                   # Headers / 快取設定
├─ .env.example                  # 環境變數範本
├─ .gitignore
└─ README.md
```

## 🧩 如何新增料理類型

編輯 `app.js` 最上方的 `CUISINE_FILTERS`，每一筆支援兩種比對：

```js
{
  id: "french", label: "法式", emoji: "🥖",
  types: ["french_restaurant"],   // 直接命中 Google place type
  keywords: ["法式", "法國", "french"]  // 比對名稱 / primaryTypeDisplay
}
```

Google Places (New) 支援的 `*_restaurant` type 清單見 [官方文件](https://developers.google.com/maps/documentation/places/web-service/place-types#table-a)。

## 🛡️ Headers / 快取（vercel.json）

- `Permissions-Policy: geolocation=(self)` — 明確允許定位
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`
- `index.html`：每次 revalidate
- `css / js / 圖片`：快取 1 小時
- `/api/places/search`：函式本身回 `Cache-Control: s-maxage=120`（Vercel Edge Cache）
- `/api/places/photo`：函式回 `Cache-Control: s-maxage=86400` 並 302 到 Google CDN

## 📝 License

MIT
