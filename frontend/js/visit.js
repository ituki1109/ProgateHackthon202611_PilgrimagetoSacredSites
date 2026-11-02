// 訪問の記録。ぬいと写真を送り、怨念がどれだけ鎮まったかを出す。

import { getNuis, createVisit } from './api.js';
import { getCurrentLocation } from './map.js';
import { grudgeGauge, grudgeStage, seal } from './ui.js';

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
  document.getElementById('visit-form').classList.remove('hidden');
  hideError();
  renderPlace();
  await renderNuiOptions();
}

// どこで記録するかを出す。推薦地点でなければ、地点の名前を入力してもらう。
function renderPlace() {
  const box = document.getElementById('visit-place');
  box.replaceChildren();

  if (place.spot) {
    box.classList.add('is-recommended');

    const kind = document.createElement('p');
    kind.className = 'place-kind';
    kind.textContent = '推薦された地点';

    const name = document.createElement('h3');
    name.className = 'place-name';
    name.textContent = place.spot.name;

    const reason = document.createElement('p');
    reason.className = 'place-reason';
    reason.textContent = place.spot.reason;

    const mark = document.createElement('p');
    mark.className = 'place-note';
    mark.textContent = 'ここで記録すると、怨念が多く鎮まります。';

    box.append(kind, name, reason, mark);
    return;
  }

  box.classList.remove('is-recommended');

  const kind = document.createElement('p');
  kind.className = 'place-kind';
  kind.textContent = '推薦地点の外';

  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = 'visit-spot-name';
  label.textContent = '地点の名前';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'visit-spot-name';
  input.placeholder = '例: 近所のカフェ';
  input.required = true;

  const where = document.createElement('p');
  where.className = 'field-note';
  where.textContent = `位置：${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;

  const field = document.createElement('div');
  field.className = 'field';
  field.append(label, input, where);
  box.append(kind, field);
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
  const recommended = Boolean(result.visit.recommended);
  const box = document.getElementById('visit-result');
  box.replaceChildren();

  // 押した朱印。推薦地点なら朱色の「鎮」、それ以外は墨色の「記」。
  const stamp = seal(recommended ? '鎮' : '記', recommended);
  stamp.classList.add('is-stamped');

  const where = document.createElement('p');
  where.className = 'result-where';
  // 地点の名前は API が返すものを使う。モックでは返らないので、画面で選んだ名前を使う。
  where.textContent = `${nuiName}と ${result.visit.spot_name || placeName}`
    + (recommended ? '（推薦された地点）' : '');

  const grudge = document.createElement('p');
  grudge.className = 'result-grudge';
  const from = document.createElement('span');
  from.className = 'result-from';
  from.textContent = String(before);
  const to = document.createElement('span');
  to.className = 'result-to';
  to.textContent = String(after);
  grudge.append('怨念 ', from, ' から ', to, ' へ');

  const diff = document.createElement('p');
  diff.className = 'result-diff';
  if (after >= before) {
    diff.textContent = 'これ以上は鎮まりません。';
  } else if (after === 0) {
    diff.textContent = `${before - after} 鎮まり、怨念がすっかり消えました。`;
  } else {
    diff.textContent = `${before - after} 鎮まりました。いまの怨念は「${grudgeStage(after).label}」です。`;
  }

  const links = document.createElement('div');
  links.className = 'actions';
  const toNuis = document.createElement('a');
  toNuis.className = 'button is-primary';
  toNuis.href = '#nuis';
  toNuis.textContent = 'ぬいの一覧を見る';
  const toMap = document.createElement('a');
  toMap.className = 'text-link';
  toMap.href = '#map';
  toMap.textContent = '地図に戻る';
  links.append(toNuis, toMap);

  box.append(stamp, where, grudge, grudgeGauge(after, `${nuiName}の怨念`, before), diff, links);
  box.classList.remove('hidden');
  document.getElementById('visit-form').classList.add('hidden');
  box.scrollIntoView({ block: 'start' });

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
