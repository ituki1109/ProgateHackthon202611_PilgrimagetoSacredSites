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
    currentMarker = L.circleMarker([lat, lng], {
      radius: 9, weight: 3, color: '#2A2140', fillColor: '#A796EC', fillOpacity: 0.9,
    })
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

  spots.forEach((spot, i) => {
    // ピンには推薦の順位を出す。一覧の番号と同じ。
    const icon = L.divIcon({
      className: 'spot-pin',
      html: `<span>${i + 1}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18],
    });
    L.marker([spot.lat, spot.lng], { icon, title: spot.name })
      .bindPopup(popupFor(spot))
      .addTo(spotLayer);

    list.appendChild(listItemFor(spot, i + 1));
  });

  // 現在地と推薦地点がすべて見えるように寄せる
  if (spots.length > 0) {
    const bounds = L.latLngBounds(spots.map((spot) => [spot.lat, spot.lng]));
    bounds.extend([current.lat, current.lng]);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  }
}

// ピンを押したときに出る中身
function popupFor(spot) {
  const box = document.createElement('div');
  box.className = 'popup';

  const name = document.createElement('strong');
  name.className = 'popup-name';
  name.textContent = spot.name;

  const reason = document.createElement('p');
  reason.className = 'popup-reason';
  reason.textContent = spot.reason;

  const score = document.createElement('p');
  score.className = 'popup-score';
  score.textContent = `推薦の点数 ${spot.score}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button is-shu is-small';
  button.textContent = 'ここで記録する';
  button.addEventListener('click', () => selectPlace(spot, spot.lat, spot.lng));

  box.append(name, reason, score, button);
  return box;
}

function listItemFor(spot, rank) {
  const li = document.createElement('li');
  li.className = 'spot-item';

  const number = document.createElement('span');
  number.className = 'spot-rank';
  number.textContent = String(rank);

  const body = document.createElement('div');
  body.className = 'spot-body';
  const name = document.createElement('strong');
  name.className = 'spot-name';
  name.textContent = spot.name;
  // 現在地からの距離は推薦理由（API）に入っている
  const reason = document.createElement('p');
  reason.className = 'spot-reason';
  reason.textContent = spot.reason;
  body.append(name, reason);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button is-shu is-small';
  button.textContent = 'ここで記録する';
  button.addEventListener('click', () => selectPlace(spot, spot.lat, spot.lng));

  li.append(number, body, button);
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

function status(text) {
  document.getElementById('map-status').textContent = text;
}
