// 推薦地点の詳細。下から出るシートで、住所や時間などを見せる（Google マップの場所の詳細と同じ形）。
// 値は GET /recommend の details と attrs（docs/api.md）。値がない項目は出さない。

import { reasonList } from './ui.js';

const ICONS = {
  address: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>',
  hours: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  phone: '<path d="M5.5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 5.6 5.6l1.4-2.3 4.5 1.8v3.5a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 4 5.5 1.5 1.5 0 0 1 5.5 4z"/>',
  url: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
  station: '<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 10.5h12M9 20.5l1.5-4M15 20.5l-1.5-4"/>',
  area: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  opened: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

// 情報の1行（左にアイコン、右に見出しと値）
function infoRow(iconName, label, value, sub) {
  const row = document.createElement('li');
  row.className = 'detail-row';
  row.innerHTML = icon(iconName);

  const body = document.createElement('div');
  const title = document.createElement('span');
  title.className = 'detail-label';
  title.textContent = label;
  body.appendChild(title);

  const text = document.createElement('span');
  text.className = 'detail-value';
  if (value instanceof Node) text.appendChild(value);
  else text.textContent = value;
  body.appendChild(text);

  if (sub) {
    const note = document.createElement('span');
    note.className = 'detail-sub';
    note.textContent = sub;
    body.appendChild(note);
  }
  row.appendChild(body);
  return row;
}

function link(href, text, external) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (external) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

// 広さを「11.7ha」や「4,310㎡」にする（推薦理由と同じ書き方）
function areaText(area) {
  return area >= 10000 ? `${(area / 10000).toFixed(1)}ha` : `${area.toLocaleString('ja-JP')}㎡`;
}

// 地点の詳細を開く。onRecord は「ここで記録する」を押したときに呼ぶ。
export function openSpotDetail(spot, onRecord) {
  let dialog = document.getElementById('spot-detail');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'spot-detail';
    dialog.className = 'spot-detail';
    dialog.setAttribute('aria-labelledby', 'spot-detail-name');
    // シートの外（暗い所）を押したら閉じる
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    document.body.appendChild(dialog);
  }

  const details = spot.details || {};
  const attrs = spot.attrs || {};
  const body = document.createElement('div');
  body.className = 'detail-body';

  // 名前と種類
  const head = document.createElement('div');
  head.className = 'detail-head';
  const titles = document.createElement('div');
  const kind = document.createElement('p');
  kind.className = 'detail-kind';
  kind.textContent = [spot.category, attrs.facility_type || attrs.park_type].filter(Boolean).join('／');
  const name = document.createElement('h3');
  name.className = 'detail-name';
  name.id = 'spot-detail-name';
  name.textContent = spot.name;
  titles.append(kind, name);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button detail-close';
  close.setAttribute('aria-label', '閉じる');
  close.innerHTML = icon('close');
  close.addEventListener('click', () => dialog.close());
  head.append(titles, close);
  body.appendChild(head);

  if (details.description) {
    const description = document.createElement('p');
    description.className = 'detail-description';
    description.textContent = details.description;
    body.appendChild(description);
  }

  // 推薦したわけ（API の reason）
  const why = document.createElement('section');
  why.className = 'detail-section';
  const whyTitle = document.createElement('h4');
  whyTitle.className = 'detail-section-title';
  whyTitle.textContent = '推薦したわけ';
  why.append(whyTitle, reasonList(spot.reason, 'spot-facts'));
  body.appendChild(why);

  // 住所や時間など。値がある項目だけを並べる
  const info = document.createElement('ul');
  info.className = 'detail-info';
  if (details.address) info.appendChild(infoRow('address', '住所', details.address));
  if (details.hours || details.hours_note) {
    info.appendChild(infoRow('hours', '開いている時間', details.hours || '時間の情報はありません', details.hours_note));
  }
  if (details.phone) {
    info.appendChild(infoRow('phone', '電話', link(`tel:${details.phone.replace(/[^\d+]/g, '')}`, details.phone)));
  }
  if (details.url) {
    const host = details.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    info.appendChild(infoRow('url', '公式サイト', link(details.url, host, true)));
  }
  if (attrs.nearest_station) {
    const passengers = attrs.station_passengers
      ? `駅の1日の乗降客数 ${attrs.station_passengers.toLocaleString('ja-JP')}人`
      : '';
    info.appendChild(infoRow('station', '最寄り駅', `${attrs.nearest_station}駅まで約${attrs.station_distance_m}m`, passengers));
  }
  if (attrs.area_m2) info.appendChild(infoRow('area', '広さ', areaText(attrs.area_m2)));
  if (details.opened_year) info.appendChild(infoRow('opened', '開園した年', `${details.opened_year}年`));
  body.appendChild(info);

  // 設備（車椅子、おむつ替えなど）
  if (Array.isArray(details.amenities) && details.amenities.length > 0) {
    const section = document.createElement('section');
    section.className = 'detail-section';
    const title = document.createElement('h4');
    title.className = 'detail-section-title';
    title.textContent = '設備';
    const chips = document.createElement('ul');
    chips.className = 'detail-amenities';
    for (const amenity of details.amenities) {
      const chip = document.createElement('li');
      chip.textContent = amenity;
      chips.appendChild(chip);
    }
    section.append(title, chips);
    body.appendChild(section);
  }

  // 下のボタン。経路は Google マップで開く
  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  const route = link(
    `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`,
    '経路を見る',
    true,
  );
  route.className = 'button';
  const record = document.createElement('button');
  record.type = 'button';
  record.className = 'button is-shu';
  record.textContent = 'ここで記録する';
  record.addEventListener('click', () => {
    dialog.close();
    onRecord();
  });
  actions.append(route, record);

  dialog.replaceChildren(body, actions);
  dialog.showModal();
  dialog.scrollTop = 0;
  close.focus();
}
