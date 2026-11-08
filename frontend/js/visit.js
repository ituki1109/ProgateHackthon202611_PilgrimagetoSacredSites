// 訪問の記録。ぬいと写真を送り、怨念がどれだけ鎮まったかを出す。

import { getNuis, createVisit, getCalmPreview } from './api.js';
import { checkHaunt } from './haunt.js';
import { getCurrentLocation } from './map.js';
import { arLink, gaugeWidth, grudgeGauge, grudgeStage, isHauntedSpot, isOverflow, nuiAvatar, reasonList, seal } from './ui.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// 記録する場所。map.js で「ここで記録する」を押すと入る。
// { spot: 推薦地点か null, lat, lng, photo: map.js のカメラで撮った写真か null }
let place = null;
let formReady = false;
let nuisById = new Map(); // 選べるぬい。結果の画面で写真と名前を使う
let previewUrl = null;    // 選んだ写真の仮の URL（使い終わったら消す）
let calmPreview = null;   // 記録前の除霊量のキャッシュ
let pendingPhoto = null;  // map.js のカメラで撮った写真。次に表示する #visit で一度だけ使う

document.addEventListener('nuituki:place-selected', (e) => {
  place = e.detail;
  pendingPhoto = e.detail.photo || null;
});

// #visit を表示するたびに呼ばれる（main.js から）
export async function showVisit() {
  const form = document.getElementById('visit-form');
  if (!formReady) {
    form.addEventListener('submit', submit);
    document.getElementById('visit-photo').addEventListener('change', showPreview);
    formReady = true;
  }

  // 地図を通らずに来たときは、現在地での記録として扱う
  if (!place) {
    const here = getCurrentLocation();
    place = { spot: null, lat: here.lat, lng: here.lng };
  }

  form.reset();
  applyPendingPhoto();
  showPreview();
  document.getElementById('visit-result').classList.add('hidden');
  document.getElementById('visit-place').classList.remove('hidden');
  form.classList.remove('hidden');
  hideError();
  renderPlace();
  await renderNuiOptions();
  refreshCalmPreview();
}

// どこで記録するかを出す。推薦地点でなければ、地点の名前を入力してもらう。
function renderPlace() {
  const box = document.getElementById('visit-place');
  box.replaceChildren();
  box.classList.toggle('is-recommended', Boolean(place.spot));

  const badge = document.createElement('p');
  badge.className = `place-badge${place.spot ? '' : ' is-outside'}`;

  if (place.spot) {
    const haunted = isHauntedSpot(place.spot);
    badge.textContent = haunted ? '除霊できる地点' : '推薦された地点';

    const name = document.createElement('h3');
    name.className = 'place-name';
    name.textContent = place.spot.name;

    const note = document.createElement('p');
    note.className = 'place-note';
    note.textContent = haunted
      ? '地点の近くまで行くと、怨念が多く鎮まります。車道や人の敷地には入らず、安全な場所から写真を撮ってください。'
      : 'ここで記録すると、怨念が多く鎮まります。同じ場所に続けて記録すると鎮まる量は減り、地点から離れているとさらに減ります。';

    box.append(badge, name, reasonList(place.spot.reason, 'place-facts'), note);
    return;
  }

  badge.textContent = '推薦地点の外';

  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = 'visit-spot-name';
  label.textContent = '地点の名前';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'visit-spot-name';
  input.placeholder = '例: 近所のカフェ';
  input.required = true;
  input.addEventListener('input', refreshCalmPreview);

  const where = document.createElement('p');
  where.className = 'field-note';
  where.textContent = `位置：${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;

  const field = document.createElement('div');
  field.className = 'field';
  field.append(label, input, where);
  box.append(badge, field);
}

// 連れて行くぬいを、怨念の強い順に、顔つきのボタンで並べる
async function renderNuiOptions() {
  const group = document.getElementById('visit-nui');
  group.replaceChildren();
  nuisById = new Map();

  try {
    const nuis = await getNuis();
    const sorted = [...nuis].sort((a, b) => b.grudge - a.grudge);

    sorted.forEach((nui, i) => {
      nuisById.set(String(nui.id), nui);

      const option = document.createElement('label');
      option.className = 'nui-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'nui_id';
      input.value = String(nui.id);
      input.className = 'visually-hidden';
      input.checked = i === 0; // いちばん怨念の強いぬいを、初めから選んでおく

      const name = document.createElement('span');
      name.className = 'nui-option-name';
      name.textContent = nui.name;
      const grudge = document.createElement('span');
      grudge.className = 'nui-option-grudge';
      grudge.textContent = `怨念 ${nui.grudge}%`;

      option.append(input, nuiAvatar(nui, 'nui-option-avatar'), name, grudge);
      group.appendChild(option);
    });

    markSelected();
    group.onchange = () => {
      markSelected();
      refreshCalmPreview();
    };

    if (sorted.length === 0) {
      showError('ぬいがまだ登録されていません。先に「登録」から追加してください。');
    }
  } catch (err) {
    console.error('[visit] ぬいの一覧が取れませんでした:', err);
    showError(`ぬいの一覧が取れませんでした（${err.message}）`);
  }
}

// 選んでいるぬいのボタンに枠を付ける
function markSelected() {
  for (const option of document.querySelectorAll('#visit-nui .nui-option')) {
    option.classList.toggle('is-selected', option.querySelector('input').checked);
  }
}

// 距離を人が読みやすい単位にする。
function distanceText(meters) {
  if (meters == null) return '—';
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

// 除霊量の内訳文。記録前のプレビューと結果画面の両方で使う。
function calmBreakdownText(calm) {
  if (calm.distance_m != null && calm.distance_factor === 0) {
    return `距離 ${distanceText(calm.distance_m)} のため、鎮まりません。`;
  }

  const parts = [];
  if (calm.repeat_count > 0) {
    parts.push(
      `基本 ${calm.base} − 同じ場所 ${calm.repeat_count + 1}回目 ${calm.repeat_penalty} = ${calm.before_distance}`,
    );
  } else {
    parts.push(`基本 ${calm.base}`);
  }

  if (calm.distance_m != null) {
    const pct = Math.round(calm.distance_factor * 100);
    parts.push(`距離 ${distanceText(calm.distance_m)}（${pct}%）`);
    if (calm.computed !== calm.before_distance) {
      parts.push(`${calm.before_distance} × ${pct}% = ${calm.computed}`);
    }
  }

  if (calm.capped) {
    parts.push(`怨念が残り${calm.amount}のため、${calm.amount}鎮まりました`);
  }

  if (calm.distance_m == null) {
    parts.push('推薦地点以外は距離の減衰なし');
  }

  return parts.join(' / ');
}

// 記録前の除霊量を出す場所。#visit-calm は動的に作る。
function calmBox() {
  let box = document.getElementById('visit-calm');
  if (!box) {
    box = document.createElement('div');
    box.id = 'visit-calm';
    box.setAttribute('aria-live', 'polite');
    const picker = document.getElementById('visit-nui');
    if (picker) picker.closest('fieldset').appendChild(box);
  }
  return box;
}

async function refreshCalmPreview() {
  const box = calmBox();
  const checked = document.querySelector('#visit-nui input[name="nui_id"]:checked');
  const submitButton = document.getElementById('visit-submit');
  submitButton.disabled = false;
  if (!checked || !place) {
    box.replaceChildren();
    return;
  }

  // 暴走しているぬいは、事故地点と空き家の駅でしか記録できない（API も同じ決まりで断る）
  if (isOverflow(nuisById.get(checked.value)?.grudge) && !isHauntedSpot(place.spot)) {
    submitButton.disabled = true;
    const note = document.createElement('p');
    note.className = 'error';
    note.textContent = 'このぬいは怨念が100を超えています。地図の「除霊できる地点」でしか記録できません。';
    box.replaceChildren(note);
    return;
  }

  const nameInput = document.getElementById('visit-spot-name');
  if (!place.spot && (!nameInput || !nameInput.value.trim())) {
    box.replaceChildren();
    const note = document.createElement('p');
    note.className = 'field-note';
    note.textContent = '地点の名前を入れると除霊量が出ます。';
    box.appendChild(note);
    return;
  }

  box.textContent = '除霊量を計算しています…';
  try {
    const data = await getCalmPreview({
      nuiId: checked.value,
      spotId: place.spot ? place.spot.id : null,
      spotName: place.spot ? null : nameInput.value.trim(),
      lat: place.lat,
      lng: place.lng,
    });
    renderCalmPreview(box, data);
  } catch (err) {
    console.error('[visit] 除霊量を取れませんでした:', err);
    box.replaceChildren();
  }
}

function renderCalmPreview(box, data) {
  const { calm } = data;
  calmPreview = data;

  const stats = document.createElement('dl');
  stats.className = 'stats';
  for (const [term, value] of [
    ['除霊量', String(calm.amount)],
    ['基本', String(calm.base)],
    ['距離', calm.distance_m == null ? '—' : distanceText(calm.distance_m)],
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
  note.textContent = calmBreakdownText(calm);

  box.replaceChildren(stats, note);
}

// map.js のカメラで撮った写真を、既存の <input type="file"> に入れる（form.reset() の直後に呼ぶ）。
function applyPendingPhoto() {
  if (!pendingPhoto) return;
  const data = new DataTransfer();
  data.items.add(pendingPhoto);
  document.getElementById('visit-photo').files = data.files;
  pendingPhoto = null;
}

// 選んだ写真を、その場で見せる
function showPreview() {
  const input = document.getElementById('visit-photo');
  const drop = input.closest('.photo-drop');
  const img = drop.querySelector('.photo-drop-preview');
  const file = input.files && input.files[0];

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = file ? URL.createObjectURL(file) : null;

  drop.classList.toggle('has-photo', Boolean(file));
  drop.querySelector('.photo-drop-empty').classList.toggle('hidden', Boolean(file));
  img.classList.toggle('hidden', !file);
  if (file) img.src = previewUrl;
  else img.removeAttribute('src');
}

async function submit(event) {
  event.preventDefault();
  hideError();

  const checked = document.querySelector('#visit-nui input[name="nui_id"]:checked');
  if (!checked) {
    showError('連れて行くぬいを選んでください。');
    return;
  }
  const nui = nuisById.get(checked.value);

  const nameInput = document.getElementById('visit-spot-name');
  if (!place.spot) {
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      showError('地点の名前を入れてください。');
      nameInput?.focus();
      return;
    }
  }

  const formData = new FormData();
  formData.append('nui_id', checked.value);
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

  // 天気（任意）。API はまだこの項目を保存しないが、画面の記録には残しておく。
  const weather = document.getElementById('visit-weather')?.value;
  if (weather) formData.append('weather', weather);

  const button = document.getElementById('visit-submit');
  button.disabled = true;
  button.textContent = '送っています…';

  try {
    const result = await createVisit(formData);
    const placeName = place.spot ? place.spot.name : nameInput.value.trim();
    renderResult(result, nui, placeName);
    checkHaunt(); // 怨念が 100 以下に戻ると、アプリの色も戻る
  } catch (err) {
    console.error('[visit] 記録に失敗しました:', err);
    showError(`記録に失敗しました（${err.message}）`);
  } finally {
    button.disabled = false;
    button.textContent = '記録する';
  }
}

// 怨念が before から after に下がったことを、朱印を押して見せる
function renderResult(result, nui, placeName) {
  const before = result.grudge_before;
  const after = result.grudge_after;
  const recommended = Boolean(result.visit.recommended);
  const calm = result.calm || null;
  const box = document.getElementById('visit-result');
  box.replaceChildren();

  // ぬいの顔は、記録する前の怨念で出しておき、朱印が押されたあとで今の顔に変える
  const hero = document.createElement('div');
  hero.className = 'result-hero';
  const avatar = nuiAvatar({ ...nui, grudge: before }, 'result-avatar');
  // 押した朱印。推薦地点なら朱色の「鎮」、それ以外は墨色の「記」。
  const stamp = seal(recommended ? '鎮' : '記', recommended);
  stamp.classList.add('is-stamped');
  hero.append(avatar, stamp);

  const title = document.createElement('h3');
  title.className = 'result-title';
  if (after >= before) title.textContent = `${nui.name}と記録しました`;
  else if (after === 0) title.textContent = `${nui.name}の怨念が消えました`;
  else title.textContent = `${nui.name}の怨念が鎮まりました`;

  const where = document.createElement('p');
  where.className = 'result-where';
  // 地点の名前は API が返すものを使う。モックでは返らないので、画面で選んだ名前を使う。
  where.textContent = (result.visit.spot_name || placeName) + (recommended ? '（推薦された地点）' : '');

  const grudge = document.createElement('p');
  grudge.className = 'result-grudge';
  const label = document.createElement('span');
  label.className = 'result-label';
  label.textContent = '怨念';
  const from = document.createElement('span');
  from.className = 'result-from';
  from.textContent = String(before);
  const arrow = document.createElement('span');
  arrow.className = 'result-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';
  const to = document.createElement('span');
  to.className = 'result-to';
  to.textContent = String(before);
  grudge.append(label, from, arrow, to);

  const gauge = grudgeGauge(before, `${nui.name}の怨念`, before);

  const calmAmount = calm ? calm.amount : Math.max(0, before - after);

  const calmRow = document.createElement('p');
  calmRow.className = 'result-grudge';
  const calmLabel = document.createElement('span');
  calmLabel.className = 'result-label';
  calmLabel.textContent = '除霊量';
  const calmValue = document.createElement('span');
  calmValue.className = 'result-to';
  calmValue.textContent = String(calmAmount);
  calmRow.append(calmLabel, calmValue);

  const diff = document.createElement('p');
  diff.className = 'result-diff';
  if (before === 0) {
    diff.textContent = '怨念はすでに鎮まっています。';
  } else if (after >= before) {
    diff.textContent = 'この場所では怨念を鎮められませんでした。地点に近づくか、別の場所で記録してください。';
  } else if (after === 0) {
    diff.textContent = `${calmAmount} 鎮まり、怨念がすっかり消えました。`;
  } else {
    diff.textContent = `${calmAmount} 鎮まりました。いまの怨念は「${grudgeStage(after).label}」です。`;
  }

  const breakdown = document.createElement('p');
  breakdown.className = 'result-diff';
  if (calm) {
    breakdown.textContent = calmBreakdownText(calm);
  } else if (after < before) {
    breakdown.textContent = '基本の除霊量で鎮まりました。';
  }

  const links = document.createElement('div');
  links.className = 'result-actions';
  const toAr = arLink(nui, after, 'button is-primary is-block');
  const toMemories = document.createElement('a');
  toMemories.className = 'button is-block';
  toMemories.href = `#nui/${nui.id}`;
  toMemories.textContent = '思い出を見る';
  const toMap = document.createElement('a');
  toMap.className = 'button is-block';
  toMap.href = '#map';
  toMap.textContent = '地図に戻る';
  links.append(toAr, toMemories, toMap);

  box.append(hero, title, where, grudge, gauge, calmRow, diff, breakdown, links);
  box.classList.remove('hidden');
  document.getElementById('visit-form').classList.add('hidden');
  document.getElementById('visit-place').classList.add('hidden');
  window.scrollTo(0, 0);

  settle(avatar, nui, gauge, to, before, after);

  // 同じ場所で続けて記録しないよう、選んだ場所を忘れる
  place = null;
  calmPreview = null;
}

// 朱印が押されたあとで、数字とゲージを after まで下げ、顔を今の怨念に合わせる
function settle(avatar, nui, gauge, to, before, after) {
  const fill = gauge.querySelector('.grudge-gauge-fill');
  const finish = () => {
    to.textContent = String(after);
    fill.style.width = gaugeWidth(after);
    gauge.className = `grudge-gauge is-${grudgeStage(after).key}`;
    gauge.setAttribute('aria-valuenow', String(after));
    if (!nui.photo_url) {
      const calmer = nuiAvatar({ ...nui, grudge: after }, 'result-avatar is-settled');
      avatar.replaceWith(calmer);
    }
  };

  if (REDUCED_MOTION.matches || after >= before) {
    finish();
    return;
  }

  const DELAY = 550;    // 朱印が押されるまで待つ
  const DURATION = 900; // 数字を下げる時間
  setTimeout(() => {
    // 数字とゲージを同じ速さで下げる
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      const value = before - (before - after) * (1 - (1 - t) ** 3);
      to.textContent = String(Math.round(value));
      fill.style.width = gaugeWidth(value);
      if (t < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
  }, DELAY);
}

function showError(text) {
  const p = document.getElementById('visit-error');
  p.textContent = text;
  p.classList.remove('hidden');
}

function hideError() {
  document.getElementById('visit-error').classList.add('hidden');
}
