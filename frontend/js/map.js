// 地図と推薦地点。Leaflet（CDN から読み込んだ L）を使う。

import { getRecommend } from './api.js';

// 対象地域は神奈川県川崎市（docs/tasks/frontend-main.md）。
// 最初の現在地は川崎駅にする。ブラウザーの位置情報は、ボタンを押したときだけ取る
// （会場で川崎市の外にいると推薦地点が出ないため、自動では求めない）。
const DEFAULT_CENTER = { lat: 35.5314, lng: 139.6968 }; // 川崎駅
const DEFAULT_ZOOM = 15;

let map = null;
let spotLayer = null;      // 推薦地点のピンをまとめて消せるようにする
let currentMarker = null;  // 現在地の印
let current = { ...DEFAULT_CENTER };

// ほかの JS（visit.js）が現在地を知るために使う
export function getCurrentLocation() {
  return { ...current };
}

// #map を表示するたびに呼ばれる（main.js から）
export function showMap() {
  if (!map) initMap();
  // 隠れている間に地図を作ると大きさがずれるので、表示のたびに直す
  map.invalidateSize();
}

function initMap() {
  map = L.map('map-canvas').setView([current.lat, current.lng], DEFAULT_ZOOM);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  spotLayer = L.layerGroup().addTo(map);

  // デモで GPS がずれたとき用。押した場所を現在地として扱う。
  map.on('click', (e) => {
    setCurrent(e.latlng.lat, e.latlng.lng, '地図で指定した場所を現在地にしました');
  });

  document.getElementById('map-locate').addEventListener('click', locate);
  document.getElementById('map-record-here').addEventListener('click', () => {
    // 推薦地点を選ばずに記録する。地点の名前は #visit で入力してもらう。
    selectPlace(null, current.lat, current.lng);
  });

  setCurrent(current.lat, current.lng);
}

// ブラウザーの位置情報で現在地を取る
function locate() {
  if (!navigator.geolocation) {
    status('この端末では位置情報が使えません。地図を押して現在地を指定してください。');
    return;
  }
  status('現在地を調べています…');
  navigator.geolocation.getCurrentPosition(
    (pos) => setCurrent(pos.coords.latitude, pos.coords.longitude, '現在地を取りました'),
    (err) => {
      console.warn('[map] 位置情報が取れませんでした:', err.message);
      status('位置情報が取れませんでした。地図を押して現在地を指定してください。');
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
    currentMarker = L.circleMarker([lat, lng], { radius: 8, weight: 3 })
      .bindTooltip('現在地')
      .addTo(map);
  }
  map.panTo([lat, lng]);

  if (message) status(message);
  loadRecommend(lat, lng);
}

async function loadRecommend(lat, lng) {
  status('この近くの推薦地点を探しています…');
  try {
    const spots = await getRecommend(lat, lng);
    drawSpots(spots);
    status(`推薦地点が ${spots.length} 件見つかりました。`);
  } catch (err) {
    console.error('[map] 推薦地点が取れませんでした:', err);
    status(`推薦地点が取れませんでした（${err.message}）`);
  }
}

function drawSpots(spots) {
  spotLayer.clearLayers();
  const list = document.getElementById('spot-list');
  list.replaceChildren();

  for (const spot of spots) {
    L.marker([spot.lat, spot.lng])
      .bindPopup(popupFor(spot))
      .addTo(spotLayer);

    list.appendChild(listItemFor(spot));
  }
}

// ピンを押したときに出る中身
function popupFor(spot) {
  const box = document.createElement('div');

  const name = document.createElement('strong');
  name.textContent = spot.name;

  const reason = document.createElement('p');
  reason.textContent = spot.reason;

  const score = document.createElement('p');
  score.textContent = `推薦の点数 ${spot.score}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'ここで記録する';
  button.addEventListener('click', () => selectPlace(spot, spot.lat, spot.lng));

  box.append(name, reason, score, button);
  return box;
}

function listItemFor(spot) {
  const li = document.createElement('li');

  const name = document.createElement('strong');
  name.textContent = spot.name;

  const reason = document.createElement('span');
  reason.textContent = ` — ${spot.reason}（約 ${distanceText(spot)}）`;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'ここで記録する';
  button.addEventListener('click', () => selectPlace(spot, spot.lat, spot.lng));

  li.append(name, reason, ' ', button);
  return li;
}

// 記録する場所を決めて、訪問の記録の画面に進む。
// spot が null のときは、推薦地点ではない場所での記録。
function selectPlace(spot, lat, lng) {
  document.dispatchEvent(new CustomEvent('nuituki:place-selected', {
    detail: { spot, lat, lng },
  }));
  location.hash = '#visit';
}

function distanceText(spot) {
  const meters = distanceMeters(current.lat, current.lng, spot.lat, spot.lng);
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// 2点の距離（m）。表示のためだけに使う。推薦の点数は API が出す。
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function status(text) {
  document.getElementById('map-status').textContent = text;
}
