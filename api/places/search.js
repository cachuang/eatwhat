// Vercel Serverless Function: 附近餐廳搜尋
// 使用 Google Places API (New) — places:searchNearby
//
// Google 單次 searchNearby 只能回 20 筆、且沒有分頁。為了在同一個半徑內
// 拿到盡可能多的餐廳，這裡做兩層 fan-out：
//
//   1. 空間切片（spatial tiling）
//      把原本以使用者為圓心的搜尋圓切成 5 格：中心 + 東 / 西 / 南 / 北。
//      中心格用原半徑（抓最靠近使用者的 20 間），
//      四個方位格偏移 R/2，各自半徑 0.75R（涵蓋對應象限的邊緣）。
//
//   2. 類型分組（type fan-out）
//      每一格再按料理「語意分組」並行查詢，避免 20 筆名額被同一類吃滿。
//
// 總計 = 5 cells × 4 type groups = 最多 20 次並行 searchNearby。
// Promise.allSettled 保底：任一呼叫失敗不影響其他結果。
// 依 Pro SKU 計費，每次搜尋約 US$0.80；Vercel edge cache 120s 會擋重複請求。

const TYPE_GROUPS = [
  ["restaurant", "food_court", "meal_takeaway"],
  ["cafe", "coffee_shop", "bakery", "ice_cream_shop", "bar"],
  [
    "japanese_restaurant",
    "korean_restaurant",
    "chinese_restaurant",
    "thai_restaurant",
    "vietnamese_restaurant",
    "sushi_restaurant",
    "ramen_restaurant",
    "indian_restaurant",
  ],
  [
    "italian_restaurant",
    "american_restaurant",
    "pizza_restaurant",
    "hamburger_restaurant",
    "mexican_restaurant",
    "barbecue_restaurant",
    "steak_house",
    "seafood_restaurant",
    "fast_food_restaurant",
    "breakfast_restaurant",
  ],
];

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.photos",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.nationalPhoneNumber",
].join(",");

const SEARCH_NEARBY_MAX_RADIUS = 50000; // Google 硬上限

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 切成 5 個子圓：中心（全半徑）+ N/S/E/W（偏移 R/2，半徑 0.75R）。
// 0.75R 是幾何上確保中心圓 + 4 個方位子圓能完整覆蓋原圓的最小半徑
// （最糟位置是大圓邊緣上 45° 方向的點，離任一方位子圓中心 ≈ 0.737R）。
function generateCells(lat, lon, radius) {
  const metersPerLatDeg = 111320;
  const metersPerLonDeg = 111320 * Math.cos((lat * Math.PI) / 180);
  const offset = radius / 2;
  const dLat = offset / metersPerLatDeg;
  const dLon = offset / metersPerLonDeg;
  const outerRadius = Math.min(radius * 0.75, SEARCH_NEARBY_MAX_RADIUS);
  const centerRadius = Math.min(radius, SEARCH_NEARBY_MAX_RADIUS);

  return [
    { lat,               lon,               radius: centerRadius }, // 中心
    { lat: lat + dLat,   lon,               radius: outerRadius  }, // 北
    { lat: lat - dLat,   lon,               radius: outerRadius  }, // 南
    { lat,               lon: lon + dLon,   radius: outerRadius  }, // 東
    { lat,               lon: lon - dLon,   radius: outerRadius  }, // 西
  ];
}

async function fetchGroup(key, types, lat, lon, radius) {
  const body = {
    includedTypes: types,
    maxResultCount: 20,
    rankPreference: "DISTANCE",
    languageCode: "zh-TW",
    regionCode: "TW",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius,
      },
    },
  };

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.places || [];
}

module.exports = async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "GOOGLE_MAPS_API_KEY 未設定。請到 Vercel Project → Settings → Environment Variables 加入。",
    });
  }

  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = Math.min(
    Math.max(parseFloat(req.query.radius) || 1000, 1),
    SEARCH_NEARBY_MAX_RADIUS
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Missing or invalid lat/lon" });
  }

  const cells = generateCells(lat, lon, radius);

  // cell × type_group 全部平行送出
  const tasks = [];
  for (const cell of cells) {
    for (const types of TYPE_GROUPS) {
      tasks.push(fetchGroup(key, types, cell.lat, cell.lon, cell.radius));
    }
  }

  const settled = await Promise.allSettled(tasks);

  const errors = [];
  const seen = new Map();
  for (const s of settled) {
    if (s.status === "rejected") {
      errors.push(s.reason?.message || String(s.reason));
      continue;
    }
    for (const p of s.value) {
      if (p.id && !seen.has(p.id)) seen.set(p.id, p);
    }
  }

  if (seen.size === 0) {
    return res.status(502).json({
      error: "Google Places API 回應失敗",
      detail: errors.join(" | ").slice(0, 500) || "所有分組查詢皆無結果",
    });
  }

  // 依使用者實際位置（不是子圓中心）排序；超出原半徑的也濾掉
  const places = [...seen.values()]
    .map((p) => {
      const pLat = p.location?.latitude;
      const pLng = p.location?.longitude;
      return {
        id: p.id,
        name: p.displayName?.text || "",
        address: p.shortFormattedAddress || p.formattedAddress || "",
        location: pLat != null && pLng != null ? { lat: pLat, lng: pLng } : null,
        rating: p.rating ?? null,
        userRatingCount: p.userRatingCount ?? 0,
        types: p.types || [],
        primaryType: p.primaryType || "",
        primaryTypeDisplay: p.primaryTypeDisplayName?.text || "",
        priceLevel: p.priceLevel || null,
        openNow: p.currentOpeningHours?.openNow ?? null,
        weekdayDescriptions: p.regularOpeningHours?.weekdayDescriptions || [],
        photos: (p.photos || []).slice(0, 3).map((ph) => ({
          name: ph.name,
          width: ph.widthPx,
          height: ph.heightPx,
          attribution: ph.authorAttributions?.[0]?.displayName || "",
        })),
        googleMapsUri: p.googleMapsUri || "",
        websiteUri: p.websiteUri || "",
        phone: p.nationalPhoneNumber || "",
        distance:
          pLat != null && pLng != null ? haversine(lat, lon, pLat, pLng) : null,
      };
    })
    // 方位子圓會涵蓋到大圓外 1.25R，把溢出的濾掉，避免結果比使用者指定的半徑遠
    .filter((p) => p.distance == null || p.distance <= radius);

  places.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
  );
  return res.status(200).json({
    results: places,
    cells: cells.length,
    groups: TYPE_GROUPS.length,
    partial: errors.length > 0,
    errorCount: errors.length,
  });
};
