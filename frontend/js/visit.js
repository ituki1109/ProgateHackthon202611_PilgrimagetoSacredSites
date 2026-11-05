// 訪問の記録。ぬいと写真を送り、怨念がどれだけ鎮まったかを出す。

import { getNuis, createVisit } from './api.js';
import { getCurrentLocation } from './map.js';
import { grudgeGauge, grudgeStage, nuiAvatar, reasonList, seal } from './ui.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
// 中間発表では AR のボタンを出さない。最終発表の前に true に戻す。ページ（ar/）は URL で開ける
const SHOW_AR = false;

// 記録する場所。map.js で「ここで記録する」を押すと入る。
// { spot: 推薦地点か null, lat, lng }
let place = null;
let formReady = false;
let nuisById = new Map(); // 選べるぬい。結果の画面で写真と名前を使う
let previewUrl = null;    // 選んだ写真の仮の URL（使い終わったら消す）

document.addEventListener('nuituki:place-selected', (e) => {
  place = e.detail;
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
  showPreview();
  document.getElementById('visit-result').classList.add('hidden');
  document.getElementById('visit-place').classList.remove('hidden');
  form.classList.remove('hidden');
  hideError();
  renderPlace();
  await renderNuiOptions();
}

// どこで記録するかを出す。推薦地点でなければ、地点の名前を入力してもらう。
function renderPlace() {
  const box = document.getElementById('visit-place');
  box.replaceChildren();
  box.classList.toggle('is-recommended', Boolean(place.spot));

  const badge = document.createElement('p');
  badge.className = `place-badge${place.spot ? '' : ' is-outside'}`;

  if (place.spot) {
    badge.textContent = '推薦された地点';

    const name = document.createElement('h3');
    name.className = 'place-name';
    name.textContent = place.spot.name;

    const note = document.createElement('p');
    note.className = 'place-note';
    note.textContent = 'ここで記録すると、怨念が多く鎮まります。';

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
      grudge.textContent = `怨念 ${nui.grudge}`;

      option.append(input, nuiAvatar(nui, 'nui-option-avatar'), name, grudge);
      group.appendChild(option);
    });

    markSelected();
    group.onchange = markSelected;

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

  const button = document.getElementById('visit-submit');
  button.disabled = true;
  button.textContent = '送っています…';

  try {
    const result = await createVisit(formData);
    const placeName = place.spot ? place.spot.name : nameInput.value.trim();
    renderResult(result, nui, placeName);
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
  links.className = 'result-actions';
  // AR は別のページ（ar/）。いまの怨念で演出を変えるので、値を URL で渡す
  const toAr = document.createElement('a');
  toAr.className = 'button is-primary is-block';
  toAr.href = `ar/?${new URLSearchParams({ nui: nui.id, name: nui.name, grudge: after })}`;
  toAr.textContent = after > 0 ? '憑依を見る' : '鎮まった様子を見る';
  const toMemories = document.createElement('a');
  toMemories.className = SHOW_AR ? 'button is-block' : 'button is-primary is-block';
  toMemories.href = `#nui/${nui.id}`;
  toMemories.textContent = '思い出を見る';
  const toMap = document.createElement('a');
  toMap.className = 'button is-block';
  toMap.href = '#map';
  toMap.textContent = '地図に戻る';
  if (SHOW_AR) links.append(toAr);
  links.append(toMemories, toMap);

  box.append(hero, title, where, grudge, gauge, diff, links);
  box.classList.remove('hidden');
  document.getElementById('visit-form').classList.add('hidden');
  document.getElementById('visit-place').classList.add('hidden');
  window.scrollTo(0, 0);

  settle(avatar, nui, gauge, to, before, after);

  // 同じ場所で続けて記録しないよう、選んだ場所を忘れる
  place = null;
}

// 朱印が押されたあとで、数字とゲージを after まで下げ、顔を今の怨念に合わせる
function settle(avatar, nui, gauge, to, before, after) {
  const fill = gauge.querySelector('.grudge-gauge-fill');
  const finish = () => {
    to.textContent = String(after);
    fill.style.width = `${after}%`;
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
      fill.style.width = `${value}%`;
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
