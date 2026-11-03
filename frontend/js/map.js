// 地図と推薦地点。Leaflet（CDN から読み込んだ L）を使う。
// 地図は画面いっぱいに出し、推薦地点はシートのカードに並べる。
// ピンとカードは連動する（ピンを押すとカードが出て、カードを送るとピンが光る）。

import { getNuis, getRecommend } from './api.js';
import { clampGrudge, grudgeGauge, grudgeStage, nuiAvatar, reasonList, stageChip } from './ui.js';

// 対象地域は神奈川県川崎市（docs/tasks/frontend-main.md）。
// 最初の現在地は川崎駅にする。ブラウザーの位置情報は、ボタンを押したときだけ取る
// （会場で川崎市の外にいると推薦地点が出ないため、自動では求めない）。
const DEFAULT_CENTER = { lat: 35.5314, lng: 139.6968 }; // 川崎駅
const DEFAULT_ZOOM = 15;

// これより広い画面では、シートを左のパネルにする（style.css と同じ値）
const WIDE = window.matchMedia('(min-width: 900px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

let map = null;
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
  if (!map) initMap();
  // 隠れている間に地図を作ると大きさがずれるので、表示のたびに直す
  map.invalidateSize();
  // 記録のあとで怨念が変わるので、表示のたびに取り直す
  renderBuddy();
}

function initMap() {
  map = L.map('map-canvas', { zoomControl: false, attributionControl: false })
    .setView([current.lat, current.lng], DEFAULT_ZOOM);

  // 地図の出典はシートの下に書いている（index.html の .attribution）
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

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

  if (spots.length === 0) {
    list.appendChild(emptyCard('3km 以内に推薦地点がありません。地図を押して、川崎市の中を現在地にしてください。'));
    map.panTo([current.lat, current.lng]);
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

  // 現在地と推薦地点がすべて、シートに隠れずに見えるように寄せる
  const bounds = L.latLngBounds(spots.map((spot) => [spot.lat, spot.lng]));
  bounds.extend([current.lat, current.lng]);
  map.fitBounds(bounds, { ...mapPadding(), maxZoom: 16 });

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

function cardFor(spot, index) {
  const li = document.createElement('li');
  li.className = 'spot-card';

  // 名前の部分を押すと、地図をその地点に寄せる
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
  head.addEventListener('click', () => setActive(index, { pan: true, scrollCard: true }));

  // 現在地からの距離は推薦理由（API）に入っている
  const facts = reasonList(spot.reason, 'spot-facts');

  const record = document.createElement('button');
  record.type = 'button';
  record.className = 'button is-shu is-small';
  record.textContent = 'ここで記録する';
  record.addEventListener('click', () => selectPlace(spot, spot.lat, spot.lng));

  li.append(head, facts, record);
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

    const text = grudge > 0
      ? buddyText(top.name, `いちばん怨んでいます。怨念 ${grudge}`, grudge)
      : buddyText(top.name, 'どのぬいも鎮まっています', grudge);
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

// 記録する場所を決めて、訪問の記録の画面に進む。
// spot が null のときは、推薦地点ではない場所での記録。
function selectPlace(spot, lat, lng) {
  document.dispatchEvent(new CustomEvent('nuituki:place-selected', {
    detail: { spot, lat, lng },
  }));
  location.hash = '#visit';
}

function status(text) {
  document.getElementById('map-status').textContent = text;
}
