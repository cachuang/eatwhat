// ===== 料理類型設定 =====
// 結合 Google Places types 與關鍵字（從 displayName/primaryTypeDisplay 比對）
// types  — 比對 place.types / primaryType（Google 官方 type）
// keywords — 比對 displayName + primaryTypeDisplay（小寫，涵蓋中/英）
const CUISINE_FILTERS = [
  { id: "japanese",   label: "日式",   emoji: "🍣",
    types: ["japanese_restaurant", "sushi_restaurant", "ramen_restaurant"],
    keywords: ["日式", "日本料理", "壽司", "拉麵", "丼", "居酒屋", "japanese", "sushi", "ramen", "izakaya"] },
  { id: "korean",     label: "韓式",   emoji: "🍜",
    types: ["korean_restaurant"],
    keywords: ["韓式", "韓國", "korean"] },
  { id: "bbq",        label: "燒肉",   emoji: "🥩",
    types: ["barbecue_restaurant", "steak_house"],
    keywords: ["燒肉", "燒烤", "yakiniku", "bbq", "barbecue", "grill", "steak", "牛排"] },
  { id: "hotpot",     label: "火鍋",   emoji: "🍲",
    types: [],
    keywords: ["火鍋", "麻辣鍋", "涮涮鍋", "壽喜燒", "hot pot", "hotpot", "shabu", "sukiyaki"] },
  { id: "breakfast",  label: "早餐",   emoji: "🥐",
    types: ["breakfast_restaurant", "brunch_restaurant"],
    keywords: ["早餐", "早午餐", "brunch", "breakfast"] },
  { id: "chinese",    label: "中式",   emoji: "🥟",
    types: ["chinese_restaurant"],
    keywords: ["中式", "中餐", "港式", "粵", "川", "湘", "江浙", "北方", "chinese", "dim sum"] },
  { id: "taiwanese",  label: "台式",   emoji: "🍱",
    types: [],
    keywords: ["台式", "台菜", "小吃", "滷味", "牛肉麵", "便當", "自助餐", "熱炒", "taiwanese"] },
  { id: "american",   label: "美式",   emoji: "🍔",
    types: ["american_restaurant", "hamburger_restaurant"],
    keywords: ["美式", "漢堡", "american", "burger", "diner"] },
  { id: "italian",    label: "義式",   emoji: "🍝",
    types: ["italian_restaurant", "pizza_restaurant"],
    keywords: ["義式", "義大利", "披薩", "義大利麵", "italian", "pizza", "pasta"] },
  { id: "thai",       label: "泰式",   emoji: "🌶️",
    types: ["thai_restaurant"],
    keywords: ["泰式", "泰國", "thai"] },
  { id: "vietnamese", label: "越式",   emoji: "🍲",
    types: ["vietnamese_restaurant"],
    keywords: ["越式", "越南", "河粉", "vietnamese", "pho"] },
  { id: "cafe",       label: "咖啡",   emoji: "☕",
    types: ["cafe", "coffee_shop"],
    keywords: ["咖啡", "cafe", "coffee"] },
  { id: "dessert",    label: "甜點",   emoji: "🍰",
    types: ["bakery", "ice_cream_shop"],
    keywords: ["甜點", "蛋糕", "麵包", "冰", "手搖", "飲", "bakery", "dessert", "ice cream"] },
  { id: "fast_food",  label: "速食",   emoji: "🍟",
    types: ["fast_food_restaurant"],
    keywords: ["速食", "fast food"] },
  { id: "indian",     label: "印度",   emoji: "🍛",
    types: ["indian_restaurant"],
    keywords: ["印度", "indian"] },
  { id: "mexican",    label: "墨式",   emoji: "🌮",
    types: ["mexican_restaurant"],
    keywords: ["墨西哥", "mexican", "taco"] },
  { id: "seafood",    label: "海鮮",   emoji: "🦐",
    types: ["seafood_restaurant"],
    keywords: ["海鮮", "seafood", "fish"] },
  { id: "vegetarian", label: "蔬食",   emoji: "🥗",
    types: ["vegetarian_restaurant", "vegan_restaurant"],
    keywords: ["蔬食", "素食", "vegetarian", "vegan"] },
];

// ===== 狀態 =====
const state = {
  userLocation: null,
  allRestaurants: [],
  activeFilters: new Set(),
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
    el.classList.toggle("active", state.activeFilters.has(el.dataset.id));
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
      locateLabel.textContent = "重新定位";
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
  setStatus(`找到 ${results.length} 間餐廳（半徑 ${formatRadius(radius)}）`);
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

function renderResults() {
  const list = getFiltered();
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
  li.className = "restaurant-item";

  // 照片
  const photoWrap = document.createElement("div");
  photoWrap.className = "restaurant-photo";
  if (r.photos && r.photos[0]) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = r.name;
    img.src = `/api/places/photo?name=${encodeURIComponent(r.photos[0].name)}&w=400`;
    img.addEventListener("error", () => photoWrap.classList.add("photo-fallback"));
    photoWrap.appendChild(img);
  } else {
    photoWrap.classList.add("photo-fallback");
    photoWrap.textContent = "🍽️";
  }
  li.appendChild(photoWrap);

  // 資訊
  const info = document.createElement("div");
  info.className = "restaurant-info";

  const name = document.createElement("div");
  name.className = "restaurant-name";
  name.textContent = r.name;
  info.appendChild(name);

  // 評分列
  const ratingRow = document.createElement("div");
  ratingRow.className = "rating-row";
  if (r.rating != null) {
    const rating = document.createElement("span");
    rating.className = "rating";
    rating.innerHTML = `<span class="stars">${renderStars(r.rating)}</span> <strong>${r.rating.toFixed(1)}</strong>`;
    ratingRow.appendChild(rating);

    if (r.userRatingCount) {
      const count = document.createElement("span");
      count.className = "rating-count";
      count.textContent = `(${formatCount(r.userRatingCount)})`;
      ratingRow.appendChild(count);
    }
  } else {
    const none = document.createElement("span");
    none.className = "rating-none";
    none.textContent = "尚無評分";
    ratingRow.appendChild(none);
  }

  if (r.priceLevel) {
    const price = document.createElement("span");
    price.className = "price";
    price.textContent = priceLevelDisplay(r.priceLevel);
    ratingRow.appendChild(price);
  }

  if (r.openNow === true) {
    const open = document.createElement("span");
    open.className = "open-now open";
    open.textContent = "營業中";
    ratingRow.appendChild(open);
  } else if (r.openNow === false) {
    const closed = document.createElement("span");
    closed.className = "open-now closed";
    closed.textContent = "休息中";
    ratingRow.appendChild(closed);
  }
  info.appendChild(ratingRow);

  // Meta
  const meta = document.createElement("div");
  meta.className = "restaurant-meta";
  if (r.primaryTypeDisplay) {
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = r.primaryTypeDisplay;
    meta.appendChild(t);
  }
  if (r.address) {
    const a = document.createElement("span");
    a.textContent = `📍 ${r.address}`;
    meta.appendChild(a);
  }
  info.appendChild(meta);

  li.appendChild(info);

  // 右側 actions
  const actions = document.createElement("div");
  actions.className = "restaurant-actions";

  if (r.distance != null) {
    const dist = document.createElement("div");
    dist.className = "distance";
    dist.textContent = formatDistance(r.distance);
    actions.appendChild(dist);
  }

  const mapLink = document.createElement("a");
  mapLink.className = "map-link";
  mapLink.href = r.googleMapsUri || mapsFallbackUrl(r);
  mapLink.target = "_blank";
  mapLink.rel = "noopener";
  mapLink.textContent = "開啟地圖 ›";
  actions.appendChild(mapLink);

  li.appendChild(actions);
  return li;
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.25 && rating - full < 0.75;
  const fullCount = half ? full : Math.round(rating);
  const empty = 5 - fullCount - (half ? 1 : 0);
  return "★".repeat(fullCount) + (half ? "☆" : "") + "☆".repeat(empty);
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

  if (r.photos && r.photos[0]) {
    const img = document.createElement("img");
    img.className = "pick-photo";
    img.alt = r.name;
    img.src = `/api/places/photo?name=${encodeURIComponent(r.photos[0].name)}&w=800`;
    pickCardEl.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "pick-body";

  const h = document.createElement("h3");
  h.textContent = "🎲 今天就吃這間！";
  body.appendChild(h);

  const n = document.createElement("div");
  n.className = "pick-name";
  n.textContent = r.name;
  body.appendChild(n);

  const metaLine = document.createElement("div");
  metaLine.className = "pick-meta";
  const parts = [];
  if (r.rating != null) parts.push(`⭐ ${r.rating.toFixed(1)} (${formatCount(r.userRatingCount || 0)})`);
  if (r.primaryTypeDisplay) parts.push(r.primaryTypeDisplay);
  if (r.distance != null) parts.push(formatDistance(r.distance));
  if (r.priceLevel) parts.push(priceLevelDisplay(r.priceLevel));
  metaLine.textContent = parts.join(" · ");
  body.appendChild(metaLine);

  if (r.address) {
    const addr = document.createElement("div");
    addr.className = "pick-meta";
    addr.textContent = `📍 ${r.address}`;
    body.appendChild(addr);
  }

  const a = document.createElement("a");
  a.className = "pick-link";
  a.href = r.googleMapsUri || mapsFallbackUrl(r);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "用 Google 地圖開啟 ›";
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
