// 怨念が 100 を超えたときの演出。アプリ全体の色を変え、画面を奪い、ぬいがしゃべり続ける。
// 色は css/style.css の :root.is-possessed で変える。怨念の計算はしない（計算は API）。

import { getNuis } from './api.js';
import { arLink, clampGrudge, isOverflow, nuiAvatar } from './ui.js';
import { mountBgmButton, updateBgm } from './bgm.js';

mountBgmButton();

const NORMAL_TITLE = document.title;
const VOICE_INTERVAL_MS = 5000;
const VOICES = [
  'どこ見てるの',
  'こっちを見て',
  'ずっと待ってたのに',
  'そこじゃない',
  '連れて行ってくれるよね',
  'ねえ、聞いてる？',
];
// 奪った画面の背景に、一面に並べるセリフ
const WALL_LINES = 90;

const jacked = new Set(); // 画面を奪ったぬい。同じぬいでは開いているあいだに1回だけ奪う
let voice = null;
let voiceTimer = 0;
let voiceIndex = 0;

// 画面を切り替えるたびと、怨念が変わったときに呼ぶ（main.js、visit.js から）
export async function checkHaunt() {
  let nuis;
  try {
    nuis = await getNuis();
  } catch (err) {
    console.warn('[haunt] ぬいの一覧が取れませんでした:', err.message);
    return;
  }
  const top = [...nuis].sort((a, b) => b.grudge - a.grudge)[0];
  const possessed = Boolean(top) && isOverflow(top.grudge);

  document.documentElement.classList.toggle('is-possessed', possessed);
  document.title = possessed ? `${top.name}が見ています` : NORMAL_TITLE;
  updateBgm(possessed);
  if (possessed) startVoice(top);
  else stopVoice();

  if (!possessed) {
    jacked.clear();
  } else if (!jacked.has(top.id)) {
    jacked.add(top.id);
    showJack(top);
  }
}

// ぬいの声。どの画面にいても、数秒ごとに話しかけてくる
function startVoice(nui) {
  if (!voice) {
    voice = document.createElement('p');
    voice.className = 'haunt-voice';
    voice.setAttribute('aria-hidden', 'true');
    document.body.appendChild(voice);
  }
  voice.hidden = false;
  voice.dataset.name = nui.name;
  speak();
  if (!voiceTimer) voiceTimer = setInterval(speak, VOICE_INTERVAL_MS);
}

function speak() {
  voice.textContent = `${voice.dataset.name}「${VOICES[voiceIndex % VOICES.length]}」`;
  voiceIndex += 1;
}

function stopVoice() {
  clearInterval(voiceTimer);
  voiceTimer = 0;
  if (voice) voice.hidden = true;
}

// 画面を奪う。除霊に行くか AR を見るまで、元の画面には戻れない
function showJack(nui) {
  const grudge = clampGrudge(nui.grudge);

  const dialog = document.createElement('dialog');
  dialog.className = 'haunt-jack';
  dialog.setAttribute('aria-labelledby', 'haunt-jack-line');
  dialog.addEventListener('cancel', (event) => event.preventDefault()); // Esc では閉じない
  dialog.addEventListener('close', () => dialog.remove());

  const wall = document.createElement('div');
  wall.className = 'haunt-jack-wall';
  wall.setAttribute('aria-hidden', 'true');
  wall.textContent = '置いていったな　'.repeat(WALL_LINES);

  const line = document.createElement('h2');
  line.id = 'haunt-jack-line';
  line.className = 'haunt-jack-line';
  line.textContent = 'もう、逃がさない';

  const name = document.createElement('p');
  name.className = 'haunt-jack-name';
  name.textContent = `${nui.name}　怨念 ${grudge}`;

  const note = document.createElement('p');
  note.className = 'haunt-jack-note';
  note.textContent = '怨念が100を超えました。除霊できるのは、事故地点と空き家の駅だけです。';

  const go = document.createElement('a');
  go.className = 'button is-primary is-block';
  go.href = '#map';
  go.textContent = '除霊に行く';
  go.addEventListener('click', () => dialog.close());

  const actions = document.createElement('div');
  actions.className = 'haunt-jack-actions';
  actions.append(go, arLink(nui, grudge, 'button is-block'));

  const body = document.createElement('div');
  body.className = 'haunt-jack-body';
  body.append(nuiAvatar(nui, 'haunt-jack-avatar'), line, name, note, actions);

  dialog.append(wall, body);
  document.body.appendChild(dialog);
  dialog.showModal();
}
