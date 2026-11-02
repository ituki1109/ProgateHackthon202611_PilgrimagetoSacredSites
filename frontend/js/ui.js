// いくつかの画面で使う見た目の部品です（ぬいの顔、怨念のゲージ、朱印）。
// データは受け取るだけで、怨念の計算はしません（計算は API）。

// 怨念の強さから、段階の名前と CSS のクラス名を決めます。
// 段階の分け方は docs/design.md の「怨念の段階」と同じです。
export function grudgeStage(grudge) {
  if (grudge <= 0) return { label: '鎮まった', key: 'calm' }; // 0
  if (grudge <= 39) return { label: '弱い', key: 'weak' }; // 1〜39
  if (grudge <= 69) return { label: '中くらい', key: 'medium' }; // 40〜69
  return { label: '強い', key: 'strong' }; // 70〜100
}

// 怨念を 0〜100 の整数にそろえます。
export function clampGrudge(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
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

// 怨念のゲージ。before を渡すと、鎮まった分を薄く残して見せます。
export function grudgeGauge(grudge, label, before) {
  const value = clampGrudge(grudge);
  const gauge = document.createElement('div');
  gauge.className = `grudge-gauge is-${grudgeStage(value).key}`;
  gauge.setAttribute('role', 'progressbar');
  gauge.setAttribute('aria-label', label);
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  gauge.setAttribute('aria-valuenow', String(value));

  if (before !== undefined) {
    const ghost = document.createElement('span');
    ghost.className = 'grudge-gauge-ghost';
    ghost.style.width = `${clampGrudge(before)}%`;
    gauge.appendChild(ghost);
  }
  const fill = document.createElement('span');
  fill.className = 'grudge-gauge-fill';
  fill.style.width = `${value}%`;
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
