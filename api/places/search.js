// Vercel Serverless Function: 附近餐廳搜尋
// 使用 Google Places API (New) — places:searchNearby
// API key 放在環境變數 GOOGLE_MAPS_API_KEY

const INCLUDED_TYPES = [
  "restaurant",
  "cafe",
  "bakery",
  "ice_cream_shop",
  "meal_takeaway",
  "food_court",
  "bar",
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

  const body = {
    includedTypes: INCLUDED_TYPES,
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

  let googleRes;
  try {
    googleRes = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return res.status(502).json({ error: `上游連線失敗: ${e.message}` });
  }

  if (!googleRes.ok) {
    const text = await googleRes.text();
    return res.status(googleRes.status).json({
      error: "Google Places API 回應失敗",
      detail: text.slice(0, 500),
    });
  }

  const data = await googleRes.json();
  const places = (data.places || []).map((p) => {
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

  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
  return res.status(200).json({ results: places });
};
