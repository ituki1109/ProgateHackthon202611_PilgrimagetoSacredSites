// BGM と、怨念モードに切り替わる瞬間の砂嵐音。
//
// 普通のとき：audio/bgm_normal.mp3（ピクニックランド）
// 怨念モード（is-possessed）のとき：audio/bgm_possessed.mp3（コールドフロッグ）
// 普通→怨念モードに変わった瞬間だけ：audio/static_burst.mp3 を約0.1秒だけ鳴らす
//
// ブラウザーは、音を伴う自動再生を初めは止めることが多いので、
// 最初のクリック・タップまで再生を待つことがあります（よくある挙動）。
//
// haunt.js の checkHaunt() から、怨念モードかどうかを渡して呼んでください。

const normal = new Audio('audio/bgm_normal.mp3');
const possessedTrack = new Audio('audio/bgm_possessed.mp3');
const staticBurst = new Audio('audio/static_burst.mp3');

normal.loop = true;
possessedTrack.loop = true;
normal.volume = 0.5;
possessedTrack.volume = 0.55;
staticBurst.volume = 0.8;

const STATIC_BURST_MS = 100; // 約0.1秒だけ鳴らして止める

let wasPossessed = false;
let started = false;
let muted = false;
let waitingForGesture = false;

// 消音は好みが残るよう、次に開いたときも覚えておく。
try {
  muted = localStorage.getItem('nuituki:bgm-muted') === 'true';
} catch (_) {
  // プライベートブラウジングなどで使えないときは、消音なしのまま進める。
}

function setMuted(value) {
  muted = value;
  normal.muted = muted;
  possessedTrack.muted = muted;
  staticBurst.muted = muted;
  try {
    localStorage.setItem('nuituki:bgm-muted', String(muted));
  } catch (_) {
    // 保存できなくても、今の再生には影響しない。
  }
}
setMuted(muted);

// 自動再生がブロックされたら、最初のクリック・タップ・キー操作まで待つ。
function waitForFirstGesture(retry) {
  if (waitingForGesture) return;
  waitingForGesture = true;
  const resume = () => {
    document.removeEventListener('pointerdown', resume);
    document.removeEventListener('keydown', resume);
    waitingForGesture = false;
    retry();
  };
  document.addEventListener('pointerdown', resume, { once: true });
  document.addEventListener('keydown', resume, { once: true });
}

function safePlay(audio) {
  const played = audio.play();
  if (played && typeof played.catch === 'function') {
    played.catch(() => waitForFirstGesture(() => safePlay(audio)));
  }
}

function applyTrack(possessed) {
  if (possessed) {
    normal.pause();
    safePlay(possessedTrack);
  } else {
    possessedTrack.pause();
    safePlay(normal);
  }
}

// haunt.js の checkHaunt() から、怨念モードかどうか（真偽値）を渡して呼びます。
export function updateBgm(possessed) {
  if (!started) {
    started = true;
    wasPossessed = possessed;
    applyTrack(possessed);
    return;
  }

  if (possessed && !wasPossessed) {
    // 普通→怨念モードに変わった瞬間だけ、砂嵐の音を一瞬鳴らす。
    staticBurst.currentTime = 0;
    safePlay(staticBurst);
    setTimeout(() => staticBurst.pause(), STATIC_BURST_MS);
  }

  if (possessed !== wasPossessed) {
    applyTrack(possessed);
  }
  wasPossessed = possessed;
}

// 右上に出す、小さな消音ボタン。デモ中にすぐ音を止められるようにするため。
export function mountBgmButton() {
  if (document.querySelector('.bgm-mute')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bgm-mute';
  const render = () => {
    button.textContent = muted ? '🔇' : '🔊';
    button.setAttribute('aria-label', muted ? 'BGMを出す' : 'BGMを消す');
  };
  render();

  button.addEventListener('click', () => {
    setMuted(!muted);
    render();
  });

  document.body.appendChild(button);
}
