// API の呼び出しをまとめる場所。
// ほかの JS は fetch を直接書かず、ここの関数を使ってください。
// 項目名と形は docs/api.md のとおりです。変えたいときは先に api.md を直します。

export const USE_MOCK = true; // API ができたら false にする

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
  if (USE_MOCK) return getJson(mockUrl('nuis.json'));
  return getJson(`${API_BASE}/nuis`);
}

// POST /nuis — ぬいの登録。formData は name、last_outing_date、photo（任意）。
export async function createNui(formData) {
  if (USE_MOCK) {
    // モックでは、送った値をそのまま返すだけ。
    // 怨念は API（backend/app/grudge.py）が出すので、画面では計算しない。
    return {
      id: Date.now(),
      name: formData.get('name') || '',
      photo_url: null,
      last_outing_date: formData.get('last_outing_date') || '',
      grudge: 0,
      visit_count: 0,
    };
  }
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
  if (USE_MOCK) {
    const all = await getJson(mockUrl('visits.json'));
    return all
      .filter((v) => v.nui_id === Number(nuiId))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return getJson(`${API_BASE}/nuis/${nuiId}/visits`);
}

// --- ここから下はモック用 ---

// POST /visits の返りの形だけを合わせた、仮の値を作る。
// 怨念の本当の計算は API が持つ。ここの引き算はモックを動かすためだけのもの。
async function mockVisit(formData) {
  const nuiId = Number(formData.get('nui_id'));
  const spotId = formData.get('spot_id') || null;
  const nuis = await getJson(mockUrl('nuis.json'));
  const nui = nuis.find((n) => n.id === nuiId);

  const before = nui ? nui.grudge : 50;
  const after = Math.max(0, before - (spotId ? 30 : 10));

  return {
    visit: {
      id: Date.now(),
      nui_id: nuiId,
      spot_id: spotId,
      // 推薦地点の名前は API が spots.json から取る。モックでは分からないので null。
      spot_name: formData.get('spot_name') || null,
      lat: Number(formData.get('lat')),
      lng: Number(formData.get('lng')),
      photo_url: null,
      recommended: Boolean(spotId),
      created_at: new Date().toISOString().slice(0, 19),
    },
    grudge_before: before,
    grudge_after: after,
  };
}
