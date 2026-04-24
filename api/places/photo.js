// Vercel Serverless Function: 照片代理
// 拿到 Places API 的 photo name 後，透過 skipHttpRedirect=true 取回真實圖片 URL，再 302 轉到瀏覽器。
// 這樣實際圖片還是由 Google CDN 直送，API key 不會外洩。

module.exports = async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(500).send("Missing GOOGLE_MAPS_API_KEY");

  const name = String(req.query.name || "");
  const maxWidth = Math.min(Math.max(parseInt(req.query.w, 10) || 400, 50), 1600);

  // 驗證 photo name 格式：places/<id>/photos/<photoId>
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) {
    return res.status(400).send("Invalid photo name");
  }

  const url =
    `https://places.googleapis.com/v1/${name}/media` +
    `?maxWidthPx=${maxWidth}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;

  let upstream;
  try {
    upstream = await fetch(url);
  } catch (e) {
    return res.status(502).send(`Photo upstream error: ${e.message}`);
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return res.status(upstream.status).send(text.slice(0, 500));
  }

  const data = await upstream.json();
  if (!data.photoUri) return res.status(502).send("No photoUri returned");

  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
  res.writeHead(302, { Location: data.photoUri });
  res.end();
};
