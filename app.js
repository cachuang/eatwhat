// ===== 料理類型設定 =====
// 結合 Google Places types 與關鍵字（從 displayName/primaryTypeDisplay 比對）
// types  — 比對 place.types / primaryType（Google 官方 type）
// keywords — 比對 displayName + primaryTypeDisplay（小寫，涵蓋中/英）
//
// 排序邏輯：台式在地 → 華語圈 → 東亞 → 東南亞/南亞 → 西方異國 →
//          料理風格 → 食材導向 → 餐飲形式（早餐/速食/咖啡/甜點）
const CUISINE_FILTERS = [
  // ── 本地 & 華語圈 ──
  { id: "taiwanese",  label: "台式",   emoji: "🍱",
    types: [],
    keywords: ["台式", "台菜", "小吃", "滷味", "牛肉麵", "便當", "自助餐", "熱炒", "taiwanese"] },
  { id: "chinese",    label: "中式",   emoji: "🥟",
    types: ["chinese_restaurant"],
    keywords: ["中式", "中餐", "港式", "粵", "川", "湘", "江浙", "北方", "chinese", "dim sum"] },

  // ── 東亞 ──
  { id: "japanese",   label: "日式",   emoji: "🍣",
    types: ["japanese_restaurant", "sushi_restaurant", "ramen_restaurant"],
    keywords: ["日式", "日本料理", "壽司", "拉麵", "丼", "居酒屋", "japanese", "sushi", "ramen", "izakaya"] },
  { id: "korean",     label: "韓式",   emoji: "🍜",
    types: ["korean_restaurant"],
    keywords: ["韓式", "韓國", "korean"] },

  // ── 東南亞 & 南亞 ──
  { id: "thai",       label: "泰式",   emoji: "🌶️",
    types: ["thai_restaurant"],
    keywords: ["泰式", "泰國", "thai"] },
  { id: "vietnamese", label: "越式",   emoji: "🍲",
    types: ["vietnamese_restaurant"],
    keywords: ["越式", "越南", "河粉", "vietnamese", "pho"] },
  { id: "indian",     label: "印度",   emoji: "🍛",
    types: ["indian_restaurant"],
    keywords: ["印度", "indian"] },

  // ── 西方異國料理 ──
  { id: "italian",    label: "義式",   emoji: "🍝",
    types: ["italian_restaurant", "pizza_restaurant"],
    keywords: ["義式", "義大利", "披薩", "義大利麵", "italian", "pizza", "pasta"] },
  { id: "american",   label: "美式",   emoji: "🍔",
    types: ["american_restaurant", "hamburger_restaurant"],
    keywords: ["美式", "漢堡", "american", "burger", "diner"] },
  { id: "mexican",    label: "墨式",   emoji: "🌮",
    types: ["mexican_restaurant"],
    keywords: ["墨西哥", "mexican", "taco"] },

  // ── 料理風格 ──
  { id: "bbq",        label: "燒肉",   emoji: "🥩",
    types: ["barbecue_restaurant", "steak_house"],
    keywords: ["燒肉", "燒烤", "yakiniku", "bbq", "barbecue", "grill", "steak", "牛排"] },
  { id: "hotpot",     label: "火鍋",   emoji: "🍲",
    types: [],
    keywords: ["火鍋", "麻辣鍋", "涮涮鍋", "壽喜燒", "hot pot", "hotpot", "shabu", "sukiyaki"] },

  // ── 食材導向 ──
  { id: "seafood",    label: "海鮮",   emoji: "🦐",
    types: ["seafood_restaurant"],
    keywords: ["海鮮", "seafood", "fish"] },
  { id: "vegetarian", label: "蔬食",   emoji: "🥗",
    types: ["vegetarian_restaurant", "vegan_restaurant"],
    keywords: ["蔬食", "素食", "vegetarian", "vegan"] },

  // ── 餐飲形式 ──
  { id: "breakfast",  label: "早餐",   emoji: "🥐",
    types: ["breakfast_restaurant", "brunch_restaurant"],
    keywords: ["早餐", "早午餐", "brunch", "breakfast"] },
  { id: "fast_food",  label: "速食",   emoji: "🍟",
    types: ["fast_food_restaurant"],
    keywords: ["速食", "fast food"] },
  { id: "cafe",       label: "咖啡",   emoji: "☕",
    types: ["cafe", "coffee_shop"],
    keywords: ["咖啡", "cafe", "coffee"] },
  { id: "dessert",    label: "甜點",   emoji: "🍰",
    types: ["bakery", "ice_cream_shop"],
    keywords: ["甜點", "蛋糕", "麵包", "冰", "手搖", "飲", "bakery", "dessert", "ice cream"] },
];

// ===== 狀態 =====
const state = {
  userLocation: null,
  allRestaurants: [],
  activeFilters: new Set(),
  sortBy: "distance", // "distance" | "rating"
  lastPickId: null,
};

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);
const locateBtn = $("locate-btn");
const locateLabel = $("locate-label");
const radiusSelect = $("radius");
const statusEl = $("status");
const filterChipsEl = $("filter-chips");
const filterAllBtn = $("filter-all");
const filterNoneBtn = $("filter-none");
const randomBtn = $("random-btn");
const resultCountEl = $("result-count");
const pickCardEl = $("pick-card");
const listEl = $("restaurant-list");
const emptyStateEl = $("empty-state");
const sortBtns = document.querySelectorAll(".seg-btn");

// ===== 初始化 =====
function init() {
  renderFilterChips();
  locateBtn.addEventListener("click", handleLocate);
  radiusSelect.addEventListener("change", () => {
    if (state.userLocation) handleLocate();
  });
  filterAllBtn.addEventListener("click", () => {
    CUISINE_FILTERS.forEach((c) => state.activeFilters.add(c.id));
    refreshChips();
    renderResults();
  });
  filterNoneBtn.addEventListener("click", () => {
    state.activeFilters.clear();
    refreshChips();
    renderResults();
  });
  randomBtn.addEventListener("click", handleRandomPick);

  sortBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const sort = btn.dataset.sort;
      if (!sort || sort === state.sortBy) return;
      state.sortBy = sort;
      sortBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.sort === sort));
      renderResults();
    });
  });
}

function renderFilterChips() {
  filterChipsEl.innerHTML = "";
  CUISINE_FILTERS.forEach((c) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.id = c.id;
    chip.textContent = `${c.emoji} ${c.label}`;
    chip.addEventListener("click", () => {
      if (state.activeFilters.has(c.id)) {
        state.activeFilters.delete(c.id);
      } else {
        state.activeFilters.add(c.id);
      }
      refreshChips();
      renderResults();
    });
    filterChipsEl.appendChild(chip);
  });
}

function refreshChips() {
  filterChipsEl.querySelectorAll(".chip").forEach((el) => {
    el.classList.toggle("is-active", state.activeFilters.has(el.dataset.id));
  });
}

// ===== 取得位置 =====
function handleLocate() {
  if (!navigator.geolocation) {
    setStatus("您的瀏覽器不支援定位功能。", true);
    return;
  }

  setStatus(`<span class="spinner"></span>正在取得位置…`);
  locateBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.userLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
      locateLabel.textContent = "重新搜尋";
      fetchRestaurants();
    },
    (err) => {
      locateBtn.disabled = false;
      const msgs = {
        1: "定位權限被拒絕，請在瀏覽器設定中允許位置存取。",
        2: "無法取得位置，請確認網路或 GPS 狀態。",
        3: "定位逾時，請再試一次。",
      };
      setStatus(msgs[err.code] || "定位失敗，請再試一次。", true);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

// ===== 呼叫後端 /api/places/search =====
async function fetchRestaurants() {
  const { lat, lon } = state.userLocation;
  const radius = Number(radiusSelect.value);
  setStatus(`<span class="spinner"></span>搜尋半徑 ${formatRadius(radius)} 內的餐廳…`);

  let data;
  try {
    const res = await fetch(
      `/api/places/search?lat=${lat}&lon=${lon}&radius=${radius}`,
      { headers: { Accept: "application/json" } }
    );
    data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (e) {
    locateBtn.disabled = false;
    setStatus(`查詢失敗：${e.message}`, true);
    return;
  }

  locateBtn.disabled = false;

  const results = (data.results || []).filter((r) => r.name);
  state.allRestaurants = results;
  const partialNote = data.partial ? "（部分結果查詢失敗，顯示已取得的）" : "";
  setStatus(`找到 ${results.length} 間餐廳（半徑 ${formatRadius(radius)}）${partialNote}`);
  renderResults();
}

// ===== 過濾與渲染 =====
function matchesFilters(r) {
  if (state.activeFilters.size === 0) return true;

  const typeSet = new Set([r.primaryType, ...(r.types || [])].filter(Boolean));
  const haystack = `${r.name} ${r.primaryTypeDisplay || ""}`.toLowerCase();

  for (const fid of state.activeFilters) {
    const f = CUISINE_FILTERS.find((x) => x.id === fid);
    if (!f) continue;
    if (f.types.some((t) => typeSet.has(t))) return true;
    if (f.keywords.some((k) => haystack.includes(k.toLowerCase()))) return true;
  }
  return false;
}

function getFiltered() {
  return state.allRestaurants.filter(matchesFilters);
}

function sortList(list) {
  if (state.sortBy === "rating") {
    // 評分高 → 低，同分比評論數；無評分的排最後
    return [...list].sort((a, b) => {
      const ra = a.rating ?? -1;
      const rb = b.rating ?? -1;
      if (rb !== ra) return rb - ra;
      return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
    });
  }
  return [...list].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

function renderResults() {
  const list = sortList(getFiltered());
  resultCountEl.textContent = state.allRestaurants.length
    ? `顯示 ${list.length} / ${state.allRestaurants.length} 間`
    : "";
  randomBtn.disabled = list.length === 0;

  listEl.innerHTML = "";
  emptyStateEl.classList.toggle("hidden", list.length !== 0 || state.allRestaurants.length === 0);
  pickCardEl.classList.add("hidden");

  list.forEach((r) => listEl.appendChild(renderItem(r)));
}

function renderItem(r) {
  const li = document.createElement("li");
  li.className = "card";

  // ===== 照片 =====
  const photo = document.createElement("div");
  photo.className = "card-photo";

  if (r.photos && r.photos[0]) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = r.name;
    img.src = `/api/places/photo?name=${encodeURIComponent(r.photos[0].name)}&w=600`;
    img.addEventListener("error", () => {
      photo.classList.add("is-fallback");
      img.remove();
      photo.insertAdjacentText("afterbegin", "◐");
    });
    photo.appendChild(img);
  } else {
    photo.classList.add("is-fallback");
    photo.textContent = "◐";
  }

  // 單一 overlay：右上角評分 pill
  const rating = document.createElement("span");
  if (r.rating != null) {
    rating.className = "rating-pill";
    rating.innerHTML =
      `<span class="star">★</span>` +
      `<span>${r.rating.toFixed(1)}</span>` +
      (r.userRatingCount
        ? `<span class="count">${formatCount(r.userRatingCount)}</span>`
        : "");
  } else {
    rating.className = "rating-pill no-rating";
    rating.textContent = "無評分";
  }
  photo.appendChild(rating);

  li.appendChild(photo);

  // ===== 內容 =====
  const body = document.createElement("div");
  body.className = "card-body";

  const name = document.createElement("h3");
  name.className = "card-name";
  name.textContent = r.name;
  body.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "card-meta";

  if (r.primaryTypeDisplay) {
    const t = document.createElement("span");
    t.className = "type";
    t.textContent = r.primaryTypeDisplay;
    meta.appendChild(t);
  }
  if (r.priceLevel) {
    if (meta.childElementCount) meta.appendChild(makeSep());
    const p = document.createElement("span");
    p.className = "price";
    p.textContent = priceLevelDisplay(r.priceLevel);
    meta.appendChild(p);
  }
  if (r.openNow === true || r.openNow === false) {
    if (meta.childElementCount) meta.appendChild(makeSep());
    const o = document.createElement("span");
    o.className = `open-dot ${r.openNow ? "is-open" : "is-closed"}`;
    o.textContent = r.openNow ? "營業中" : "休息中";
    meta.appendChild(o);
  }
  if (meta.childElementCount) body.appendChild(meta);

  if (r.address) {
    const addr = document.createElement("div");
    addr.className = "card-address";
    addr.textContent = r.address;
    body.appendChild(addr);
  }

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const dist = document.createElement("span");
  dist.className = "card-distance";
  dist.textContent = r.distance != null ? formatDistance(r.distance) : "";
  footer.appendChild(dist);

  const mapLink = document.createElement("a");
  mapLink.className = "card-link";
  mapLink.href = r.googleMapsUri || mapsFallbackUrl(r);
  mapLink.target = "_blank";
  mapLink.rel = "noopener";
  mapLink.innerHTML = "Google 地圖 <span aria-hidden='true'>→</span>";
  footer.appendChild(mapLink);

  body.appendChild(footer);
  li.appendChild(body);
  return li;
}

function makeSep() {
  const s = document.createElement("span");
  s.className = "sep";
  s.textContent = "·";
  return s;
}

function priceLevelDisplay(level) {
  const map = {
    PRICE_LEVEL_FREE: "免費",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };
  return map[level] || "";
}

function formatCount(n) {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k+`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatRadius(m) {
  if (m < 1000) return `${m} m`;
  return `${m / 1000} km`;
}

function mapsFallbackUrl(r) {
  if (r.location) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}&query_place_id=${r.id}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}`;
}

// ===== 隨機抽 =====
function handleRandomPick() {
  const list = getFiltered();
  if (list.length === 0) return;
  let pick;
  let attempt = 0;
  do {
    pick = list[Math.floor(Math.random() * list.length)];
    attempt++;
  } while (list.length > 1 && pick.id === state.lastPickId && attempt < 5);
  state.lastPickId = pick.id;
  renderPickCard(pick);
}

function renderPickCard(r) {
  pickCardEl.innerHTML = "";
  pickCardEl.classList.remove("hidden");

  // ── 左側照片 ──
  const photoWrap = document.createElement("div");
  photoWrap.className = "pick-photo";

  if (r.photos && r.photos[0]) {
    const img = document.createElement("img");
    img.alt = r.name;
    img.src = `/api/places/photo?name=${encodeURIComponent(r.photos[0].name)}&w=900`;
    photoWrap.appendChild(img);
  } else {
    photoWrap.style.display = "flex";
    photoWrap.style.alignItems = "center";
    photoWrap.style.justifyContent = "center";
    photoWrap.style.fontSize = "64px";
    photoWrap.style.color = "var(--muted-soft)";
    photoWrap.textContent = "◐";
  }
  pickCardEl.appendChild(photoWrap);

  // ── 右側內容 ──
  const body = document.createElement("div");
  body.className = "pick-body";

  const eyebrow = document.createElement("div");
  eyebrow.className = "pick-eyebrow";
  eyebrow.textContent = "今日推薦";
  body.appendChild(eyebrow);

  const n = document.createElement("h2");
  n.className = "pick-name";
  n.textContent = r.name;
  body.appendChild(n);

  const metaLine = document.createElement("div");
  metaLine.className = "pick-meta";
  const parts = [];
  if (r.rating != null) {
    parts.push(`<strong>★ ${r.rating.toFixed(1)}</strong>${r.userRatingCount ? ` · ${formatCount(r.userRatingCount)} 則` : ""}`);
  }
  if (r.primaryTypeDisplay) parts.push(r.primaryTypeDisplay);
  if (r.priceLevel) parts.push(priceLevelDisplay(r.priceLevel));
  if (r.distance != null) parts.push(formatDistance(r.distance));
  if (r.openNow === true) parts.push(`<strong style="color:var(--success)">營業中</strong>`);
  else if (r.openNow === false) parts.push(`<strong style="color:var(--danger)">休息中</strong>`);
  metaLine.innerHTML = parts.join(" · ");
  body.appendChild(metaLine);

  if (r.address) {
    const addr = document.createElement("div");
    addr.className = "pick-meta";
    addr.textContent = r.address;
    body.appendChild(addr);
  }

  const a = document.createElement("a");
  a.className = "pick-cta";
  a.href = r.googleMapsUri || mapsFallbackUrl(r);
  a.target = "_blank";
  a.rel = "noopener";
  a.innerHTML = "在 Google 地圖開啟 <span aria-hidden='true'>→</span>";
  body.appendChild(a);

  pickCardEl.appendChild(body);
  pickCardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ===== 工具 =====
function setStatus(html, isError = false) {
  statusEl.innerHTML = html;
  statusEl.classList.toggle("error", isError);
}

init();
