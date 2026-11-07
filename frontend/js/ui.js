// いくつかの画面で使う見た目の部品です（ぬいの顔、怨念のゲージ、朱印）。
// データは受け取るだけで、怨念の計算はしません（計算は API）。

const GRUDGE_OVERFLOW = 100;
const GRUDGE_MAX = 200;

// 怨念の強さから、段階の名前、CSS のクラス名、ぬいのセリフを決めます。
// 段階の分け方とセリフは docs/design.md の「怨念の段階」と同じです。
export function grudgeStage(grudge) {
  if (grudge <= 0) return { label: '鎮まった', key: 'calm', line: 'また連れてってね' }; // 0
  if (grudge <= 39) return { label: '弱い', key: 'weak', line: '…許してあげてもいいよ' }; // 1〜39
  if (grudge <= 69) return { label: '中くらい', key: 'medium', line: '最近ずっと置いていくよね' }; // 40〜69
  if (grudge <= GRUDGE_OVERFLOW) return { label: '強い', key: 'strong', line: '放置してゆるさない…' }; // 70〜100
  return { label: '暴走', key: 'possessed', line: 'もう、逃がさない' }; // 101〜200
}

// 怨念を 0〜200 の整数にそろえます。backend/app/grudge.py の GRUDGE_MAX と同じ値です。
export function clampGrudge(value) {
  return Math.max(0, Math.min(GRUDGE_MAX, Math.round(Number(value) || 0)));
}

// 怨念が 100 を超えて、暴走しているかどうか。
export function isOverflow(grudge) {
  return Number(grudge) > GRUDGE_OVERFLOW;
}

// 暴走したぬいを連れて行ける地点（事故地点と空き家の駅）かどうか。
export function isHauntedSpot(spot) {
  return spot?.category === '事故地点' || spot?.category === '空き家の駅';
}

// AR のページ（ar/）を開くボタン。いまの怨念で演出が変わるので、値を URL で渡します。
export function arLink(nui, grudge, className) {
  const link = document.createElement('a');
  link.className = className;
  link.href = `ar/?${new URLSearchParams({ nui: nui.id, name: nui.name, grudge })}`;
  link.textContent = grudge > 0 ? '憑依を見る' : '鎮まった様子を見る';
  return link;
}

// 段階ごとの目と口。強いほど目が据わり、額にどんより線が出ます。
const FACES = {
  calm: `
    <path d="M20 37 q4 -5 8 0 M36 37 q4 -5 8 0" class="face-line"/>
    <path d="M28 45 q4 4 8 0" class="face-line"/>`,
  weak: `
    <circle cx="24" cy="37" r="3.2" class="face-fill"/><circle cx="40" cy="37" r="3.2" class="face-fill"/>
    <path d="M29 45 h6" class="face-line"/>`,
  medium: `
    <path d="M19 35 h10 a5 4.5 0 0 1 -10 0 z M35 35 h10 a5 4.5 0 0 1 -10 0 z" class="face-fill"/>
    <path d="M28 46 q2 -2 4 0 q2 2 4 0" class="face-line"/>`,
  strong: `
    <path d="M18 31 l12 3 M46 31 l-12 3" class="face-line"/>
    <path d="M19 36 h10 a5 4 0 0 1 -10 0 z M35 36 h10 a5 4 0 0 1 -10 0 z" class="face-fill"/>
    <path d="M28 47 q2 -2 4 0 q2 2 4 0" class="face-line"/>
    <path d="M24 17 v7 M29 15 v9 M35 15 v9 M40 17 v7" class="face-gloom"/>`,
  possessed: `
    <path d="M17 29 l13 5 M47 29 l-13 5" class="face-line"/>
    <circle cx="24" cy="38" r="4.2" class="face-fill"/><circle cx="40" cy="38" r="4.2" class="face-fill"/>
    <circle cx="24" cy="38" r="1.4" class="face-glint"/><circle cx="40" cy="38" r="1.4" class="face-glint"/>
    <path d="M24 49 l4 -3 l4 3 l4 -3 l4 3" class="face-line"/>
    <path d="M22 18 v8 M28 15 v10 M36 15 v10 M42 18 v8" class="face-gloom"/>`,
};

// 写真がないときのぬいの顔（SVG）。stageKey は grudgeStage().key。
export function nuiFace(stageKey, className) {
  const wrap = document.createElement('div');
  wrap.className = `${className} nui-face`;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
    <svg viewBox="0 0 64 64">
      <circle cx="15" cy="17" r="10" class="face-ear"/><circle cx="49" cy="17" r="10" class="face-ear"/>
      <circle cx="15" cy="17" r="5" class="face-ear-in"/><circle cx="49" cy="17" r="5" class="face-ear-in"/>
      <ellipse cx="32" cy="37" rx="25" ry="21" class="face-head"/>
      ${FACES[stageKey] || FACES.weak}
    </svg>`;
  return wrap;
}

// ぬいの丸い写真。photo_url が null のときは、怨念の段階に合わせた顔を出します。
// 縁の色も段階で変わるので、一覧を見ただけで怨念の強さが分かります。
export function nuiAvatar(nui, className) {
  const stage = grudgeStage(clampGrudge(nui.grudge));
  const classes = `avatar ${className} is-${stage.key}`;
  if (!nui.photo_url) return nuiFace(stage.key, classes);

  const photo = document.createElement('img');
  photo.className = classes;
  photo.src = nui.photo_url;
  photo.alt = `${nui.name}の写真`;
  return photo;
}

// 怨念の段階を表す小さな札（「強い」など）。
export function stageChip(grudge) {
  const stage = grudgeStage(clampGrudge(grudge));
  const chip = document.createElement('span');
  chip.className = `stage-chip is-${stage.key}`;
  chip.textContent = stage.label;
  return chip;
}

// 推薦理由（「。」で区切った文）を、1つずつの行にします。
export function reasonList(reason, className) {
  const list = document.createElement('ul');
  list.className = className;
  for (const fact of String(reason || '').split('。')) {
    if (!fact.trim()) continue;
    const item = document.createElement('li');
    item.textContent = fact.trim();
    list.appendChild(item);
  }
  return list;
}

// ゲージの長さ。怨念が 100 を超えたら振り切れたままにします。
export function gaugeWidth(grudge) {
  return `${Math.min(GRUDGE_OVERFLOW, Math.max(0, Number(grudge) || 0))}%`;
}

// 怨念のゲージ。before を渡すと、鎮まった分を薄く残して見せます。
export function grudgeGauge(grudge, label, before) {
  const value = clampGrudge(grudge);
  const gauge = document.createElement('div');
  gauge.className = `grudge-gauge is-${grudgeStage(value).key}`;
  gauge.setAttribute('role', 'progressbar');
  gauge.setAttribute('aria-label', label);
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', String(GRUDGE_MAX));
  gauge.setAttribute('aria-valuenow', String(value));

  if (before !== undefined) {
    const ghost = document.createElement('span');
    ghost.className = 'grudge-gauge-ghost';
    ghost.style.width = gaugeWidth(before);
    gauge.appendChild(ghost);
  }
  const fill = document.createElement('span');
  fill.className = 'grudge-gauge-fill';
  fill.style.width = gaugeWidth(value);
  gauge.appendChild(fill);
  return gauge;
}

// 朱印。推薦地点での記録は朱色、それ以外は墨色にします。
export function seal(text, recommended) {
  const mark = document.createElement('span');
  mark.className = `seal ${recommended ? 'is-shu' : 'is-sumi'}`;
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = text;
  return mark;
}

// 写真を画面いっぱいに出します。どこかを押すか、Esc キーで閉じます。
// caption は { title, sub, recommended }。
export function openPhoto(src, alt, caption) {
  let dialog = document.getElementById('photo-viewer');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'photo-viewer';
    dialog.className = 'photo-viewer';
    dialog.addEventListener('click', () => dialog.close());
    document.body.appendChild(dialog);
  }

  const figure = document.createElement('figure');
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;

  const text = document.createElement('figcaption');
  const title = document.createElement('strong');
  title.textContent = caption.title;
  const sub = document.createElement('span');
  sub.textContent = caption.sub || '';
  text.append(title, sub);
  if (caption.recommended !== undefined) {
    text.appendChild(seal(caption.recommended ? '鎮' : '記', caption.recommended));
  }
  figure.append(img, text);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'photo-viewer-close';
  close.textContent = '閉じる';

  dialog.replaceChildren(figure, close);
  dialog.showModal();
  close.focus();
}
