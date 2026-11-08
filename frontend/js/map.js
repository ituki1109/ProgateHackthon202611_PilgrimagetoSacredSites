// 地図と推薦地点。Leaflet（CDN から読み込んだ L）を使う。
// 地図は画面いっぱいに出し、推薦地点はシートのカードに並べる。
// ピンとカードは連動する（ピンを押すとカードが出て、カードを送るとピンが光る）。

import { getNuis, getRecommend } from './api.js';
import { openCamera } from './camera.js';
import { openSpotDetail } from './spot-detail.js';
import { clampGrudge, grudgeGauge, grudgeStage, isHauntedSpot, isOverflow, nuiAvatar, reasonList, stageChip } from './ui.js';

// 対象地域は神奈川県川崎市（docs/tasks/frontend-main.md）。
// 最初の現在地は川崎駅にする。ブラウザーの位置情報は、ボタンを押したときだけ取る
// （会場で川崎市の外にいると推薦地点が出ないため、自動では求めない）。
const DEFAULT_CENTER = { lat: 35.5314, lng: 139.6968 }; // 川崎駅
const DEFAULT_ZOOM = 15;
const TILE_WAIT_MS = 3000; // 推薦地点を待たずにタイルを出すまでの時間

// スマホで画面の解像度がこの倍率以上なら、1段細かいタイルを半分の大きさで出して、ぼやけないようにする。
// 地図の文字は小さくなり、タイルの数も増えるので、広い画面（WIDE）では通常のタイルのままにする。
const SHARP_TILE_MIN_RATIO = 2;

// 除霊量の距離減衰。backend/app/grudge.py と同じ値。
const DISTANCE_FULL_M = 100;   // この距離までは満額
const DISTANCE_ZERO_M = 2000;  // この距離以上は効果なし
const CALM_RECOMMENDED = 50;   // 推薦地点の基本除霊量

// これより広い画面では、シートを左のパネルにする（style.css と同じ値）
const WIDE = window.matchMedia('(min-width: 900px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

let map = null;
let tiles = null;          // 地図のタイル
let spotLayer = null;      // 推薦地点のピンをまとめて消せるようにする
let currentMarker = null;  // 現在地の印
let current = { ...DEFAULT_CENTER };
let markers = [];          // 推薦地点のピン。一覧のカードと同じ順
let activeIndex = -1;      // いま選んでいる推薦地点
let ignoreScrollUntil = 0; // ピンを押してカードを送っている間は、スクロールで選び直さない

// ほかの JS（visit.js）が現在地を知るために使う
export function getCurrentLocation() {
  return { ...current };
}

// #map を表示するたびに呼ばれる（main.js から）
export function showMap() {
  // 怨念が 100 を超えると推薦地点が変わるので、2回目からは表示のたびに取り直す
  if (!map) initMap();
  else loadRecommend(current.lat, current.lng);
  // 隠れている間に地図を作ると大きさがずれるので、表示のたびに直す
  map.invalidateSize();
  // 記録のあとで怨念が変わるので、表示のたびに取り直す
  renderBuddy();
}

function initMap() {
  map = L.map('map-canvas', { zoomControl: false })
    .setView([current.lat, current.lng], DEFAULT_ZOOM);
  // OpenStreetMap のタイルの決まりで、出典は地図の上に見えるように出す
  map.attributionControl.setPrefix(false).setPosition('topright');

  // タイルはまだ地図に足さない。推薦地点に地図を寄せてから足すと、
  // 寄せる前のズームのタイルを読まずに済む（showTiles）。
  tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    detectRetina: window.devicePixelRatio >= SHARP_TILE_MIN_RATIO && !WIDE.matches,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  // タイルを読み終えたら、main.js が文字のフォントを読み始める
  tiles.once('load', () => document.dispatchEvent(new CustomEvent('nuituki:map-ready')));
  // API の返事が遅くても、地図が空のままにならないようにする
  setTimeout(showTiles, TILE_WAIT_MS);

  spotLayer = L.layerGroup().addTo(map);

  // デモで GPS がずれたとき用。押した場所を現在地として扱う。
  map.on('click', (e) => {
    setCurrent(e.latlng.lat, e.latlng.lng, '押した場所を現在地にしました');
  });

  document.getElementById('map-locate').addEventListener('click', locate);
  document.getElementById('map-record-here').addEventListener('click', () => {
    // 推薦地点を選ばずに記録する。地点の名前は #visit で入力してもらう。
    selectPlace(null, current.lat, current.lng);
  });
  document.getElementById('map-sheet-toggle').addEventListener('click', toggleSheet);
  document.getElementById('spot-list').addEventListener('scroll', onListScroll, { passive: true });

  setCurrent(current.lat, current.lng);
}

// 地図のタイルを出す。2回目からは何もしない。
function showTiles() {
  if (!map.hasLayer(tiles)) tiles.addTo(map);
}

// シートをたたむと、地図を広く見られる
function toggleSheet() {
  const sheet = document.getElementById('map-sheet');
  const button = document.getElementById('map-sheet-toggle');
  const collapsed = sheet.classList.toggle('is-collapsed');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? '推薦地点の一覧を広げる' : '推薦地点の一覧をたたむ');
}

// ブラウザーの位置情報で現在地を取る
function locate() {
  if (!navigator.geolocation) {
    status('この端末では位置情報が使えません。地図を押して指定してください');
    return;
  }
  status('現在地を調べています…');
  navigator.geolocation.getCurrentPosition(
    (pos) => setCurrent(pos.coords.latitude, pos.coords.longitude, '現在地を取りました'),
    (err) => {
      console.warn('[map] 位置情報が取れませんでした:', err.message);
      status('位置情報が取れませんでした。地図を押して指定してください');
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

// 現在地を変える。変えたら推薦地点を取り直す。
function setCurrent(lat, lng, message) {
  current = { lat, lng };

  if (currentMarker) {
    currentMarker.setLatLng([lat, lng]);
  } else {
    const icon = L.divIcon({
      className: 'here-pin',
      html: '<span class="here-dot"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    currentMarker = L.marker([lat, lng], { icon, title: '現在地', keyboard: false, zIndexOffset: -100 })
      .addTo(map);
  }

  if (message) status(message);
  loadRecommend(lat, lng);
}

async function loadRecommend(lat, lng) {
  status('この近くの推薦地点を探しています…');
  showSkeleton();
  try {
    const spots = await getRecommend(lat, lng);
    drawSpots(spots);
    status(spots.length > 0 ? `推薦地点が ${spots.length} 件あります` : '近くに推薦地点がありません');
  } catch (err) {
    console.error('[map] 推薦地点が取れませんでした:', err);
    document.getElementById('spot-list').replaceChildren(emptyCard(`推薦地点が取れませんでした（${err.message}）`));
    status('推薦地点が取れませんでした');
    showTiles();
  }
}

// 読み込み中は、カードの形だけを薄く出しておく
function showSkeleton() {
  const list = document.getElementById('spot-list');
  if (list.querySelector('.spot-card:not(.is-skeleton)')) return; // 前の結果は残したまま待つ
  list.replaceChildren(...[0, 1].map(() => {
    const li = document.createElement('li');
    li.className = 'spot-card is-skeleton';
    li.setAttribute('aria-hidden', 'true');
    return li;
  }));
}

function emptyCard(text) {
  const li = document.createElement('li');
  li.className = 'spot-card is-empty';
  li.textContent = text;
  return li;
}

function drawSpots(spots) {
  spotLayer.clearLayers();
  markers = [];
  activeIndex = -1;
  const list = document.getElementById('spot-list');
  list.replaceChildren();
  list.scrollTo({ left: 0, top: 0 });

  // 怨念が 100 を超えると、事故地点と空き家の駅でしか記録できない（API が決める）
  const haunted = spots.some(isHauntedSpot);
  document.getElementById('map-title').textContent = haunted ? '除霊できる地点' : '近くの推薦地点';
  document.getElementById('map-record-here').classList.toggle('hidden', haunted);

  if (spots.length === 0) {
    list.appendChild(emptyCard('3km 以内に推薦地点がありません。地図を押して、川崎市の中を現在地にしてください。'));
    map.panTo([current.lat, current.lng]);
    showTiles();
    return;
  }

  spots.forEach((spot, i) => {
    // ピンには推薦の順位を出す。カードの番号と同じ。
    const icon = L.divIcon({
      className: 'spot-pin',
      html: `<span class="spot-pin-body"><span>${i + 1}</span></span>`,
      iconSize: [36, 44],
      iconAnchor: [18, 42],
    });
    const marker = L.marker([spot.lat, spot.lng], { icon, title: spot.name, riseOnHover: true })
      .addTo(spotLayer);
    marker.on('click', () => setActive(i, { scrollCard: true }));
    markers.push(marker);

    list.appendChild(cardFor(spot, i));
  });

  // 現在地と推薦地点がすべて、シートに隠れずに見えるように寄せる。
  // 遠征先は遠いので含めない（カードを選ぶと、そこへ動く）
  const nearby = spots.filter((spot) => spot.category !== '空き家の駅');
  const bounds = L.latLngBounds((nearby.length > 0 ? nearby : spots).map((spot) => [spot.lat, spot.lng]));
  bounds.extend([current.lat, current.lng]);
  // 最初はタイルがまだないので、動かさずに寄せる
  map.fitBounds(bounds, { ...mapPadding(), maxZoom: 16, animate: map.hasLayer(tiles) });
  showTiles();

  setActive(0);
}

// 地図の上に重なっている部分（上の帯、シート）の大きさ
function mapPadding() {
  const sheet = document.getElementById('map-sheet');
  if (WIDE.matches) {
    return { paddingTopLeft: [sheet.offsetWidth + 48, 96], paddingBottomRight: [32, 32] };
  }
  // スマホでは、シートの上に浮かせたぬいの分も空ける
  const buddy = document.getElementById('map-buddy');
  return { paddingTopLeft: [24, 88], paddingBottomRight: [24, sheet.offsetHeight + buddy.offsetHeight + 28] };
}

// 2点間の直線距離（メートル）。ハバーサイン公式。
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

// 距離減衰係数（0〜1）。backend/app/grudge.py と同じ計算。
function distanceFactor(meters) {
  if (meters <= DISTANCE_FULL_M) return 1;
  if (meters >= DISTANCE_ZERO_M) return 0;
  return 1 - (meters - DISTANCE_FULL_M) / (DISTANCE_ZERO_M - DISTANCE_FULL_M);
}

// 距離を人が読みやすい単位にする。
function formatDistance(meters) {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

// 推薦地点カードに出す「最大除霊量の見積もり」を作る。
// 地図画面ではぬいがまだ選ばれていないので、ぬいに依存しない値だけを出す。
function calmStatsFor(spot) {
  const distance = Math.round(distanceM(current.lat, current.lng, spot.lat, spot.lng));
  const factor = distanceFactor(distance);
  const base = CALM_RECOMMENDED;
  const computed = Math.round(base * factor);

  const stats = document.createElement('dl');
  stats.className = 'stats';
  for (const [term, value] of [
    ['最大除霊量', String(computed)],
    ['基本', String(base)],
    ['距離', formatDistance(distance)],
  ]) {
    const item = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    item.append(dt, dd);
    stats.appendChild(item);
  }

  const note = document.createElement('p');
  note.className = 'field-note';
  note.textContent = factor === 0
    ? '2km以上離れているため、この地点では鎮められません。'
    : `距離減衰 ${Math.round(factor * 100)}%。ぬいを選ぶと実際の除霊量が確定します。`;

  const box = document.createElement('div');
  box.append(stats, note);
  return box;
}

function cardFor(spot, index) {
  const li = document.createElement('li');
  li.className = 'spot-card';

  // 名前の部分を押すと、地図をその地点に寄せて、詳細を開く
  const showDetail = () => {
    setActive(index, { pan: true, scrollCard: true });
    openSpotDetail(spot, () => selectPlace(spot, spot.lat, spot.lng));
  };
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'spot-head';
  const rank = document.createElement('span');
  rank.className = 'spot-rank';
  rank.textContent = String(index + 1);
  const name = document.createElement('strong');
  name.className = 'spot-name';
  name.textContent = spot.name;
  head.append(rank, name);
  head.addEventListener('click', showDetail);

  // カードには、推薦理由（API）のうち現在地からの距離だけを出す。
  // 種類や駅からの距離などは、「詳しく見る」の画面で読める
  const facts = reasonList(spot.reason, 'spot-facts');
  for (const item of [...facts.children]) {
    if (!item.textContent.startsWith('現在地から')) item.remove();
  }

  const actions = document.createElement('div');
  actions.className = 'spot-actions';
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'button is-small';
  more.textContent = '詳しく見る';
  more.addEventListener('click', showDetail);
  const record = document.createElement('button');
  record.type = 'button';
  record.className = 'button is-shu is-small';
  record.textContent = 'ここで記録する';
  record.addEventListener('click', () => selectPlace(spot, spot.lat, spot.lng));
  actions.append(more, record);

  const calm = calmStatsFor(spot);

  li.append(head, facts, calm, actions);
  return li;
}

// index 番目の推薦地点を選ぶ。ピンを朱色にして、カードに枠を付ける。
function setActive(index, { pan = false, scrollCard = false } = {}) {
  if (!markers[index]) return;
  activeIndex = index;

  markers.forEach((marker, i) => {
    const el = marker.getElement();
    if (el) el.classList.toggle('is-active', i === index);
    marker.setZIndexOffset(i === index ? 1000 : 0);
  });

  const cards = document.querySelectorAll('#spot-list .spot-card');
  cards.forEach((card, i) => card.classList.toggle('is-active', i === index));

  if (pan) map.panInside(markers[index].getLatLng(), mapPadding());
  if (scrollCard && cards[index]) {
    ignoreScrollUntil = Date.now() + 800;
    cards[index].scrollIntoView({
      behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }
}

// スマホでカードを横に送ったら、真ん中に来たカードの地点を選ぶ
let scrollTimer = 0;
function onListScroll() {
  if (WIDE.matches) return; // PC は縦に並ぶので、スクロールでは選ばない
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    if (Date.now() < ignoreScrollUntil) return;
    const list = document.getElementById('spot-list');
    const center = list.scrollLeft + list.clientWidth / 2;
    let nearest = -1;
    let nearestGap = Infinity;
    list.querySelectorAll('.spot-card').forEach((card, i) => {
      const gap = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
      if (gap < nearestGap) {
        nearest = i;
        nearestGap = gap;
      }
    });
    if (nearest >= 0 && nearest !== activeIndex) setActive(nearest, { pan: true });
  }, 120);
}

// いちばん怨念の強いぬいを、シートの上に出す（連れ出す相手を思い出してもらう）
async function renderBuddy() {
  const box = document.getElementById('map-buddy');
  try {
    const nuis = await getNuis();
    if (!Array.isArray(nuis) || nuis.length === 0) {
      box.removeAttribute('aria-busy');
      box.href = '#register';
      box.className = 'buddy is-calm';
      box.replaceChildren(buddyText('ぬいがまだいません', '登録して、一緒に出かけましょう'));
      return;
    }

    const top = [...nuis].sort((a, b) => b.grudge - a.grudge)[0];
    const grudge = clampGrudge(top.grudge);
    box.removeAttribute('aria-busy');
    box.href = `#nui/${top.id}`;
    box.className = `buddy is-${grudgeStage(grudge).key}`;

    let note = 'どのぬいも鎮まっています';
    if (isOverflow(grudge)) note = `暴走しています。怨念 ${grudge}`;
    else if (grudge > 0) note = `いちばん怨んでいます。怨念 ${grudge}`;
    const text = buddyText(top.name, note, grudge);
    box.replaceChildren(nuiAvatar(top, 'buddy-avatar'), text);
  } catch (err) {
    console.warn('[map] ぬいの一覧が取れませんでした:', err.message);
    box.classList.add('hidden');
  }
}

function buddyText(title, sub, grudge) {
  const body = document.createElement('span');
  body.className = 'buddy-body';
  const name = document.createElement('strong');
  name.className = 'buddy-name';
  name.textContent = title;
  const note = document.createElement('span');
  note.className = 'buddy-note';
  note.textContent = sub;
  body.append(name, note);
  if (grudge !== undefined) {
    name.appendChild(stageChip(grudge));
    body.appendChild(grudgeGauge(grudge, `${title}の怨念`));
  }
  return body;
}

// 記録する場所を決めて、カメラを開いたあとで訪問の記録の画面に進む。
// spot が null のときは、推薦地点ではない場所での記録。
// 推薦地点でも、送る位置は現在地にする。地点までの距離で除霊量が変わるため。
async function selectPlace(spot, lat, lng) {
  const here = spot ? current : { lat, lng };

  // 「ここで記録する」を押した直後にカメラを起動する。
  // 戻り値は File（撮影/選択した写真）、null（写真なしで進む）、undefined（やめる）。
  const photo = await openCamera();
  if (photo === undefined) return; // やめたので地図に留まる

  document.dispatchEvent(new CustomEvent('nuituki:place-selected', {
    detail: { spot, lat: here.lat, lng: here.lng, photo },
  }));
  location.hash = '#visit';
}

function status(text) {
  document.getElementById('map-status').textContent = text;
}
