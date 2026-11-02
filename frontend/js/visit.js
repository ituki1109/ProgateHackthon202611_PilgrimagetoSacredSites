// 訪問の記録。ぬいと写真を送り、怨念がどれだけ鎮まったかを出す。

import { getNuis, createVisit } from './api.js';
import { getCurrentLocation } from './map.js';

// 記録する場所。map.js で「ここで記録する」を押すと入る。
// { spot: 推薦地点か null, lat, lng }
let place = null;
let formReady = false;

document.addEventListener('nuituki:place-selected', (e) => {
  place = e.detail;
});

// #visit を表示するたびに呼ばれる（main.js から）
export async function showVisit() {
  if (!formReady) {
    document.getElementById('visit-form').addEventListener('submit', submit);
    formReady = true;
  }

  // 地図を通らずに来たときは、現在地での記録として扱う
  if (!place) {
    const here = getCurrentLocation();
    place = { spot: null, lat: here.lat, lng: here.lng };
  }

  document.getElementById('visit-result').classList.add('hidden');
  hideError();
  renderPlace();
  await renderNuiOptions();
}

// どこで記録するかを出す。推薦地点でなければ、地点の名前を入力してもらう。
function renderPlace() {
  const box = document.getElementById('visit-place');
  box.replaceChildren();

  if (place.spot) {
    const name = document.createElement('p');
    name.textContent = `記録する場所：${place.spot.name}`;

    const reason = document.createElement('p');
    reason.textContent = place.spot.reason;

    const mark = document.createElement('p');
    mark.textContent = '推薦された地点です。怨念が多く鎮まります。';

    box.append(name, reason, mark);
    return;
  }

  const label = document.createElement('label');
  label.htmlFor = 'visit-spot-name';
  label.textContent = '地点の名前';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'visit-spot-name';
  input.placeholder = '例: 近所のカフェ';
  input.required = true;

  const where = document.createElement('p');
  where.textContent = `位置：${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;

  const p = document.createElement('p');
  p.append(label, document.createElement('br'), input);
  box.append(p, where);
}

// 連れて行くぬいを、怨念の強い順に並べる
async function renderNuiOptions() {
  const select = document.getElementById('visit-nui');
  select.replaceChildren();

  try {
    const nuis = await getNuis();
    const sorted = [...nuis].sort((a, b) => b.grudge - a.grudge);

    for (const nui of sorted) {
      const option = document.createElement('option');
      option.value = String(nui.id);
      option.dataset.name = nui.name;
      option.textContent = `${nui.name}（怨念 ${nui.grudge}）`;
      select.appendChild(option);
    }

    if (sorted.length === 0) {
      showError('ぬいがまだ登録されていません。先に登録してください。');
    }
  } catch (err) {
    console.error('[visit] ぬいの一覧が取れませんでした:', err);
    showError(`ぬいの一覧が取れませんでした（${err.message}）`);
  }
}

async function submit(event) {
  event.preventDefault();
  hideError();

  const select = document.getElementById('visit-nui');
  const nuiId = select.value;
  if (!nuiId) {
    showError('連れて行くぬいを選んでください。');
    return;
  }

  const nameInput = document.getElementById('visit-spot-name');
  if (!place.spot) {
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      showError('地点の名前を入れてください。');
      return;
    }
  }

  const formData = new FormData();
  formData.append('nui_id', nuiId);
  formData.append('lat', String(place.lat));
  formData.append('lng', String(place.lng));
  if (place.spot) {
    // 推薦地点のときは、地点の名前を API が spots.json から取る
    formData.append('spot_id', place.spot.id);
  } else {
    formData.append('spot_name', nameInput.value.trim());
  }

  const photo = document.getElementById('visit-photo').files[0];
  if (photo) formData.append('photo', photo);

  const button = document.getElementById('visit-submit');
  button.disabled = true;
  button.textContent = '送っています…';

  try {
    const result = await createVisit(formData);
    const nuiName = select.selectedOptions[0].dataset.name;
    const placeName = place.spot ? place.spot.name : nameInput.value.trim();
    renderResult(result, nuiName, placeName);
  } catch (err) {
    console.error('[visit] 記録に失敗しました:', err);
    showError(`記録に失敗しました（${err.message}）`);
  } finally {
    button.disabled = false;
    button.textContent = '記録する';
  }
}

// 怨念が before から after に下がったことを出す
function renderResult(result, nuiName, placeName) {
  const before = result.grudge_before;
  const after = result.grudge_after;
  const box = document.getElementById('visit-result');
  box.replaceChildren();

  const title = document.createElement('p');
  title.textContent = '記録しました。';

  const grudge = document.createElement('p');
  grudge.textContent = `怨念が ${before} → ${after} に鎮まった`;

  const diff = document.createElement('p');
  diff.textContent = after < before
    ? `${before - after} 下がりました。`
    : 'これ以上は鎮まりません。';

  const where = document.createElement('p');
  // 地点の名前は API が返すものを使う。モックでは返らないので、画面で選んだ名前を使う。
  where.textContent = `${nuiName} と ${result.visit.spot_name || placeName}`
    + (result.visit.recommended ? '（推薦された地点）' : '');

  const links = document.createElement('p');
  const toMap = document.createElement('a');
  toMap.href = '#map';
  toMap.textContent = '地図に戻る';
  const toNuis = document.createElement('a');
  toNuis.href = '#nuis';
  toNuis.textContent = 'ぬいの一覧を見る';
  links.append(toMap, ' / ', toNuis);

  box.append(title, grudge, diff, where, links);
  box.classList.remove('hidden');

  // 同じ場所で続けて記録しないよう、選んだ場所を忘れる
  place = null;
}

function showError(text) {
  const p = document.getElementById('visit-error');
  p.textContent = text;
  p.classList.remove('hidden');
}

function hideError() {
  document.getElementById('visit-error').classList.add('hidden');
}
