// Vercel Serverless Function: 附近餐廳搜尋
// 使用 Google Places API (New) — places:searchNearby
//
// 單次 searchNearby 只能回 20 筆，所以這裡把類型切成多組平行查詢，
// 合併去重後依距離排序，可以得到更廣的覆蓋（通常 40~80 間）。
// API key 放在環境變數 GOOGLE_MAPS_API_KEY。

// 分組策略：每組涵蓋「語意相近」的類型，避免 20 筆名額被同一類吃滿。
// 新增 / 調整此清單會直接影響 API 成本（每組 = 一次 searchNearby 呼叫）。
const TYPE_GROUPS = [
  // 通用餐廳（含美食街、外帶）— 抓一般最近的各式餐廳
  ["restaurant", "food_court", "meal_takeaway"],
  // 咖啡 / 甜點 / 酒吧 — 一般餐廳查詢容易漏掉
  ["cafe", "coffee_shop", "bakery", "ice_cream_shop", "bar"],
  // 亞洲料理專門店
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
  // 西式 / 其他專門店
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
  const radius = Math.min(Math.max(parseFloat(req.query.radius) || 1000, 1), 50000);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Missing or invalid lat/lon" });
  }

  // 平行打多組 searchNearby
  const settled = await Promise.allSettled(
    TYPE_GROUPS.map((types) => fetchGroup(key, types, lat, lon, radius))
  );

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

  const places = [...seen.values()].map((p) => {
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
      distance: pLat != null && pLng != null ? haversine(lat, lon, pLat, pLng) : null,
    };
  });

  places.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
  );
  return res.status(200).json({
    results: places,
    groups: TYPE_GROUPS.length,
    partial: errors.length > 0,
  });
};
