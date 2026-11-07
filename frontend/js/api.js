// API の呼び出しをまとめる場所。
// ほかの JS は fetch を直接書かず、ここの関数を使ってください。
// 項目名と形は docs/api.md のとおりです。変えたいときは先に api.md を直します。

export const USE_MOCK = false; // 仮の JSON で画面を作るときだけ true にする

// API のアドレス。API のサーバーが画面も配るので、本番は空のままでよい。
// 静的サーバー（ポート 5500）から API（ポート 8000）を呼ぶときだけ
// 'http://localhost:8000' にする。
export const API_BASE = '';

// mock/ の場所は、このファイル（js/api.js）からの相対で求める。
// ページの URL が変わっても同じ場所を指すようにするため。
function mockUrl(name) {
  return new URL(`../mock/${name}`, import.meta.url).href;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

async function postForm(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

// 失敗したときは FastAPI の { "detail": "..." } を読んで、その文を返す。
async function errorMessage(res) {
  try {
    const body = await res.json();
    if (body && body.detail) return String(body.detail);
  } catch (_) { /* JSON でなければ状態コードだけ返す */ }
  return `${res.status} ${res.statusText}`;
}

// GET /nuis — ぬいの一覧（登録した順）
export async function getNuis() {
  if (USE_MOCK) return getMockNuis();
  return getJson(`${API_BASE}/nuis`);
}

// POST /nuis — ぬいの登録。formData は name、last_outing_date、photo（任意）。
export async function createNui(formData) {
  if (USE_MOCK) return createMockNui(formData);
  return postForm('/nuis', formData);
}

// GET /recommend?lat=&lng= — 推薦地点（点数の高い順に5件）
export async function getRecommend(lat, lng) {
  if (USE_MOCK) return getJson(mockUrl('recommend.json'));
  const query = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return getJson(`${API_BASE}/recommend?${query}`);
}

// POST /visits — 訪問の記録。
// formData は nui_id、lat、lng、spot_id か spot_name、photo（任意）。
// 返りは { visit, grudge_before, grudge_after }。
export async function createVisit(formData) {
  if (USE_MOCK) return mockVisit(formData);
  return postForm('/visits', formData);
}

// GET /nuis/{id}/visits — そのぬいの思い出（新しい順）
export async function getVisits(nuiId) {
  if (USE_MOCK) return getMockVisits(nuiId);
  return getJson(`${API_BASE}/nuis/${nuiId}/visits`);
}

// --- ここから下はモック用 ---

// backend/app/grudge.py と同じ値。変えるときは両方そろえる。
const MOCK_GRUDGE = {
  perDay: 2,            // GRUDGE_PER_DAY
  calmRecommended: 50,  // CALM_RECOMMENDED
  calmOther: 10,        // CALM_OTHER
  repeatDecay: 10,      // REPEAT_DECAY
  calmMin: 10,          // CALM_MIN
  distanceFullM: 300,   // DISTANCE_FULL_M
  distanceZeroM: 3000,  // DISTANCE_ZERO_M
};

// モックの JSON は1回だけ読み、そのあとは同じ配列を使い回す。
// 記録した訪問を足せるので、同じ場所の連続除霊もモックで確かめられる。
let mockDataPromise = null;

async function loadMockData() {
  if (!mockDataPromise) {
    mockDataPromise = Promise.all([
      getJson(mockUrl('nuis.json')),
      getJson(mockUrl('visits.json')),
      getJson(mockUrl('recommend.json')),
    ]).then(([nuis, visits, spots]) => ({
      nuis,
      visits,
      spotsById: new Map(spots.map((spot) => [spot.id, spot])),
    }));
  }
  return mockDataPromise;
}

// 'YYYY-MM-DD' を、その日の0時の Date にする。
function parseDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysBetween(lastOutingDate) {
  const last = parseDate(lastOutingDate);
  if (!last) return 0;
  return Math.max(0, Math.floor((todayStart() - last) / 86400000));
}

function distanceM(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = p2 - p1;
  const dl = toRad(Number(lng2) - Number(lng1));
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

// 記録した位置が推薦地点にどれだけ近いか（0〜1）。推薦地点以外は減衰なし。
function distanceFactor(visit, spotsById) {
  if (!visit.spot_id) return 1;
  const spot = spotsById.get(visit.spot_id);
  if (!spot) return 0;

  const distance = distanceM(visit.lat, visit.lng, spot.lat, spot.lng);
  if (!Number.isFinite(distance)) return 1;
  if (distance <= MOCK_GRUDGE.distanceFullM) return 1;
  if (distance >= MOCK_GRUDGE.distanceZeroM) return 0;
  return 1 - (distance - MOCK_GRUDGE.distanceFullM)
    / (MOCK_GRUDGE.distanceZeroM - MOCK_GRUDGE.distanceFullM);
}

// 同じ場所かどうか。推薦地点は spot_id、それ以外は地点名で見る。
function placeKey(visit) {
  if (visit.spot_id) return `spot:${visit.spot_id}`;
  return `other:${String(visit.spot_name || '').trim()}`;
}

// backend/app/grudge.py の calc_grudge と同じ計算。
function calcMockGrudge(lastOutingDate, visits, spotsById) {
  let grudge = Math.min(100, daysBetween(lastOutingDate) * MOCK_GRUDGE.perDay);

  const ordered = [...visits].sort((a, b) => (
    String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || (a.id || 0) - (b.id || 0)
  ));

  let previousKey = null;
  let streak = 0;
  for (const visit of ordered) {
    const key = placeKey(visit);
    if (key === previousKey) streak += 1;
    else streak = 0;

    const base = visit.recommended
      ? MOCK_GRUDGE.calmRecommended
      : MOCK_GRUDGE.calmOther;
    const calm = Math.max(MOCK_GRUDGE.calmMin, base - MOCK_GRUDGE.repeatDecay * streak)
      * distanceFactor(visit, spotsById);
    grudge -= Math.round(calm);

    previousKey = key;
  }

  return Math.max(0, grudge);
}

function nowText() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function getMockNuis() {
  const { nuis, visits, spotsById } = await loadMockData();
  return nuis.map((nui) => {
    const nuiVisits = visits.filter((visit) => visit.nui_id === nui.id);
    return {
      ...nui,
      // JSON の grudge ではなく、バックエンドと同じ式で毎回計算する。
      grudge: calcMockGrudge(nui.last_outing_date, nuiVisits, spotsById),
      visit_count: nuiVisits.length,
    };
  });
}

async function createMockNui(formData) {
  const { nuis, spotsById } = await loadMockData();
  const id = Math.max(0, ...nuis.map((nui) => nui.id)) + 1;
  const nui = {
    id,
    name: String(formData.get('name') || ''),
    photo_url: null,
    last_outing_date: String(formData.get('last_outing_date') || ''),
  };
  nuis.push(nui);

  return {
    ...nui,
    grudge: calcMockGrudge(nui.last_outing_date, [], spotsById),
    visit_count: 0,
  };
}

async function getMockVisits(nuiId) {
  const { visits } = await loadMockData();
  return visits
    .filter((visit) => visit.nui_id === Number(nuiId))
    .sort((a, b) => (
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
      || (b.id || 0) - (a.id || 0)
    ));
}

// POST /visits の返りの形を合わせた、仮の値を作る。
// 除霊の計算はバックエンドと同じ式（同じ場所の連続減衰・距離減衰）にする。
async function mockVisit(formData) {
  const { nuis, visits, spotsById } = await loadMockData();
  const nuiId = Number(formData.get('nui_id'));
  const nui = nuis.find((item) => item.id === nuiId);
  const spotId = formData.get('spot_id') || null;
  const spot = spotId ? spotsById.get(spotId) : null;
  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));
  const spotName = spot ? spot.name : String(formData.get('spot_name') || '');
  const recommended = Boolean(spotId);

  const nuiVisits = visits.filter((visit) => visit.nui_id === nuiId);
  const before = nui
    ? calcMockGrudge(nui.last_outing_date, nuiVisits, spotsById)
    : 50;

  const visit = {
    id: Math.max(0, ...visits.map((item) => item.id || 0)) + 1,
    nui_id: nuiId,
    spot_id: spotId,
    spot_name: spotName,
    lat,
    lng,
    photo_url: null,
    recommended,
    created_at: nowText(),
  };
  visits.push(visit);

  const after = nui
    ? calcMockGrudge(
      nui.last_outing_date,
      visits.filter((item) => item.nui_id === nuiId),
      spotsById,
    )
    : Math.max(0, before - (recommended ? MOCK_GRUDGE.calmRecommended : MOCK_GRUDGE.calmOther));

  return {
    visit,
    grudge_before: before,
    grudge_after: after,
  };
}
