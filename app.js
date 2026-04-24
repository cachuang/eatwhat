// ===== 料理類型設定 =====
// 每個類型會對應到 OpenStreetMap 的 cuisine tag 關鍵字（可多個，代表任一命中即算）
const CUISINE_FILTERS = [
  { id: "japanese",   label: "日式",   emoji: "🍣", match: ["japanese", "sushi", "ramen", "udon", "tempura", "izakaya", "donburi"] },
  { id: "korean",     label: "韓式",   emoji: "🍜", match: ["korean"] },
  { id: "bbq",        label: "燒肉",   emoji: "🥩", match: ["barbecue", "bbq", "korean_barbecue", "yakiniku", "grill", "steak_house", "steak"] },
  { id: "hotpot",     label: "火鍋",   emoji: "🍲", match: ["hot_pot", "hotpot", "shabu_shabu", "shabu-shabu", "sukiyaki"] },
  { id: "breakfast",  label: "早餐",   emoji: "🥐", match: ["breakfast", "brunch"] },
  { id: "chinese",    label: "中式",   emoji: "🥟", match: ["chinese", "dim_sum", "dumpling", "noodle", "cantonese", "sichuan", "szechuan", "hunan", "shanghainese"] },
  { id: "taiwanese",  label: "台式",   emoji: "🍱", match: ["taiwanese", "beef_noodle", "lu_wei"] },
  { id: "american",   label: "美式",   emoji: "🍔", match: ["american", "burger", "diner", "bbq_american"] },
  { id: "italian",    label: "義式",   emoji: "🍝", match: ["italian", "pizza", "pasta"] },
  { id: "thai",       label: "泰式",   emoji: "🌶️", match: ["thai"] },
  { id: "vietnamese", label: "越式",   emoji: "🍲", match: ["vietnamese", "pho"] },
  { id: "cafe",       label: "咖啡",   emoji: "☕", match: ["coffee_shop", "coffee", "cafe"] },
  { id: "dessert",    label: "甜點",   emoji: "🍰", match: ["ice_cream", "dessert", "bubble_tea", "cake", "bakery", "donut", "crepe"] },
  { id: "fast_food",  label: "速食",   emoji: "🍟", match: ["fast_food", "burger", "fried_chicken", "sandwich"] },
  { id: "indian",     label: "印度",   emoji: "🍛", match: ["indian"] },
  { id: "mexican",    label: "墨式",   emoji: "🌮", match: ["mexican", "tex-mex"] },
  { id: "seafood",    label: "海鮮",   emoji: "🦐", match: ["seafood", "fish"] },
  { id: "vegetarian", label: "蔬食",   emoji: "🥗", match: ["vegetarian", "vegan"] },
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

// ===== 查詢 Overpass API =====
async function fetchRestaurants() {
  const { lat, lon } = state.userLocation;
  const radius = Number(radiusSelect.value);
  setStatus(`<span class="spinner"></span>搜尋半徑 ${formatRadius(radius)} 內的餐廳…`);

  // 查詢 amenity=restaurant/fast_food/cafe 並抓取常見 tag
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"^(restaurant|fast_food|cafe|food_court|ice_cream|bar|pub)$"](around:${radius},${lat},${lon});
      way["amenity"~"^(restaurant|fast_food|cafe|food_court|ice_cream|bar|pub)$"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
  ];

  let data = null;
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  locateBtn.disabled = false;

  if (!data) {
    setStatus(`查詢失敗：${lastErr ? lastErr.message : "未知錯誤"}，請稍後再試。`, true);
    return;
  }

  const results = (data.elements || [])
    .map((el) => normalizeElement(el, lat, lon))
    .filter((r) => r && r.name); // 過濾沒有名稱的

  // 按距離排序
  results.sort((a, b) => a.distance - b.distance);

  state.allRestaurants = results;
  setStatus(`找到 ${results.length} 間餐廳（半徑 ${formatRadius(radius)}）`);
  renderResults();
}

function normalizeElement(el, userLat, userLon) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const name = tags.name || tags["name:zh"] || tags["name:en"] || "";
  const cuisines = (tags.cuisine || "").toLowerCase().split(";").map((s) => s.trim()).filter(Boolean);
  const distance = haversine(userLat, userLon, lat, lon);

  return {
    id: `${el.type}/${el.id}`,
    name,
    lat,
    lon,
    amenity: tags.amenity,
    cuisines,
    address: composeAddress(tags),
    phone: tags.phone || tags["contact:phone"] || "",
    website: tags.website || tags["contact:website"] || "",
    openingHours: tags.opening_hours || "",
    distance,
    tags,
  };
}

function composeAddress(tags) {
  const parts = [
    tags["addr:full"],
    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
    tags["addr:city"],
  ].filter(Boolean);
  return parts.join(", ");
}

// Haversine 距離（公尺）
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

// ===== 過濾與渲染 =====
function matchesFilters(r) {
  if (state.activeFilters.size === 0) return true;
  for (const fid of state.activeFilters) {
    const f = CUISINE_FILTERS.find((x) => x.id === fid);
    if (!f) continue;
    // cuisine tag 比對
    if (r.cuisines.some((c) => f.match.some((m) => c.includes(m)))) return true;
    // fast_food / cafe / ice_cream amenity 也對應相關類型
    if (fid === "fast_food" && r.amenity === "fast_food") return true;
    if (fid === "cafe" && r.amenity === "cafe") return true;
    if (fid === "dessert" && r.amenity === "ice_cream") return true;
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
  pickCardEl.classList.add("hidden"); // 篩選變動後清掉隨機卡

  list.slice(0, 100).forEach((r) => listEl.appendChild(renderItem(r)));
}

function renderItem(r) {
  const li = document.createElement("li");
  li.className = "restaurant-item";

  const info = document.createElement("div");
  info.className = "restaurant-info";

  const name = document.createElement("div");
  name.className = "restaurant-name";
  name.textContent = r.name;
  info.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "restaurant-meta";

  const amenityLabel = amenityDisplay(r.amenity);
  if (amenityLabel) {
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = amenityLabel;
    meta.appendChild(t);
  }

  r.cuisines.slice(0, 3).forEach((c) => {
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = humanizeCuisine(c);
    meta.appendChild(t);
  });

  if (r.openingHours) {
    const t = document.createElement("span");
    t.textContent = `⏰ ${r.openingHours}`;
    meta.appendChild(t);
  }

  if (r.address) {
    const t = document.createElement("span");
    t.textContent = `📍 ${r.address}`;
    meta.appendChild(t);
  }

  info.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "restaurant-actions";

  const dist = document.createElement("div");
  dist.className = "distance";
  dist.textContent = formatDistance(r.distance);
  actions.appendChild(dist);

  const mapLink = document.createElement("a");
  mapLink.className = "map-link";
  mapLink.href = mapsUrl(r);
  mapLink.target = "_blank";
  mapLink.rel = "noopener";
  mapLink.textContent = "開啟地圖 ›";
  actions.appendChild(mapLink);

  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

function amenityDisplay(a) {
  switch (a) {
    case "restaurant": return "餐廳";
    case "fast_food": return "速食";
    case "cafe": return "咖啡";
    case "food_court": return "美食街";
    case "ice_cream": return "冰品";
    case "bar": return "酒吧";
    case "pub": return "酒館";
    default: return "";
  }
}

function humanizeCuisine(c) {
  const map = {
    japanese: "日式", sushi: "壽司", ramen: "拉麵", udon: "烏龍麵",
    korean: "韓式", korean_barbecue: "韓式燒肉", bbq: "燒烤", barbecue: "燒烤",
    yakiniku: "燒肉", hot_pot: "火鍋", hotpot: "火鍋", shabu_shabu: "涮涮鍋",
    chinese: "中式", dim_sum: "港點", dumpling: "餃子", noodle: "麵食",
    taiwanese: "台式", american: "美式", burger: "漢堡", italian: "義式",
    pizza: "披薩", pasta: "義大利麵", thai: "泰式", vietnamese: "越式", pho: "越南河粉",
    coffee_shop: "咖啡", cafe: "咖啡", fast_food: "速食",
    ice_cream: "冰品", dessert: "甜點", bubble_tea: "手搖飲", bakery: "烘焙",
    indian: "印度", mexican: "墨西哥", seafood: "海鮮", vegetarian: "蔬食", vegan: "純素",
    breakfast: "早餐", brunch: "早午餐", steak_house: "牛排", steak: "牛排",
  };
  return map[c] || c;
}

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatRadius(m) {
  if (m < 1000) return `${m} m`;
  return `${m / 1000} km`;
}

function mapsUrl(r) {
  // Google Maps 搜尋連結（兼容桌面與行動版）
  const q = encodeURIComponent(`${r.name} ${r.address || ""}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=&ll=${r.lat},${r.lon}`;
}

// ===== 隨機抽 =====
function handleRandomPick() {
  const list = getFiltered();
  if (list.length === 0) return;
  let pick;
  // 若有超過一間，盡量避開上次的
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

  const h = document.createElement("h3");
  h.textContent = "🎲 今天就吃這間！";
  pickCardEl.appendChild(h);

  const n = document.createElement("div");
  n.className = "pick-name";
  n.textContent = r.name;
  pickCardEl.appendChild(n);

  const meta = document.createElement("div");
  meta.className = "pick-meta";
  const cuisineText = r.cuisines.map(humanizeCuisine).join("・") || amenityDisplay(r.amenity) || "餐廳";
  meta.textContent = `${cuisineText} · ${formatDistance(r.distance)}${r.address ? " · " + r.address : ""}`;
  pickCardEl.appendChild(meta);

  const a = document.createElement("a");
  a.className = "pick-link";
  a.href = mapsUrl(r);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "用 Google 地圖開啟 ›";
  pickCardEl.appendChild(a);

  pickCardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ===== 工具 =====
function setStatus(html, isError = false) {
  statusEl.innerHTML = html;
  statusEl.classList.toggle("error", isError);
}

init();
