import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { getNuis } from '../js/api.js';
import { clampGrudge, grudgeGauge, grudgeStage, isOverflow, nuiAvatar, stageChip } from '../js/ui.js';
import { compileMarker, loadImage } from './marker.js';
import { createHauntEffect, hauntLook } from './effects.js';
import { createPuppet } from './puppet.js';
import { TAG_TILT_DEG } from './config.js';

// 標準の名札の照合データ。模様を変えたら marker.html で作り直す
const STANDARD_TARGET = './marker.mind';
const SCAN_MESSAGE = 'ぬいの名札（マーカー）を映してください';

// 希望するカメラの解像度。MindAR は解像度を指定しないので、何もしないと 640×480 になることが多い。
// 名札が映像の中で 100px ほどより小さいと認識できないので、PC では 1080p を頼む。
// スマホは処理が重くならないよう 720p にする。カメラが対応していなければ、近い解像度になる
const WIDE_SCREEN = window.matchMedia('(min-width: 900px)').matches;
const CAMERA = {
  width: { ideal: WIDE_SCREEN ? 1920 : 1280 },
  height: { ideal: WIDE_SCREEN ? 1080 : 720 },
  frameRate: { ideal: 30 },
};

// 認識の設定。warmupTolerance は見つけてから演出を出すまで、missTolerance は見失ってから消すまでのフレーム数。
// 動かすと一瞬見失うことが多いので、すぐ出して、少し待ってから消す。そのあいだに見つけ直せば、演出は途切れない
const TRACKING = { warmupTolerance: 1, missTolerance: 30 };

if (navigator.mediaDevices?.getUserMedia) {
  const media = navigator.mediaDevices;
  const getUserMedia = media.getUserMedia.bind(media);
  media.getUserMedia = (constraints) => getUserMedia({ ...constraints, video: { ...constraints.video, ...CAMERA } });
}

// 記録の結果画面から、?nui=1&name=もちもち&grudge=70 の形で渡される。
// 直接開いたときは、いちばん強い怨念の演出にする
const params = new URLSearchParams(location.search);
const grudge = params.has('grudge') ? clampGrudge(params.get('grudge')) : 100;
const nuiName = params.get('name');
const nuiId = params.get('nui');

const startScreen = document.getElementById('start');
const startButton = document.getElementById('start-button');
const markerInput = document.getElementById('marker-file');
const markerPreview = document.getElementById('marker-preview');
const statusText = document.getElementById('status');
const stopButton = document.getElementById('stop-button');
const container = document.getElementById('ar');

let customMarker = null;
let session = null;

document.getElementById('ar-title').textContent = grudge > 0 ? '憑依を見る' : '鎮まった様子を見る';
// 暴走しているときは、開始画面をアプリと同じ暗い赤にし、カメラの映像も赤く染める（style.css）
document.documentElement.classList.toggle('is-possessed', isOverflow(grudge));
const nuiLine = document.getElementById('nui-line');
nuiLine.textContent = grudgeStage(grudge).line;
const avatar = nuiAvatar({ name: nuiName, grudge }, 'profile-avatar');
nuiLine.after(avatar);
if (nuiName) {
  document.getElementById('nui-name').textContent = nuiName;
  const meta = document.getElementById('nui-grudge');
  meta.append(`怨念 ${grudge}`, stageChip(grudge));
  meta.after(grudgeGauge(grudge, `${nuiName}の怨念`));
  meta.hidden = false;
}
if (/^\d+$/.test(nuiId ?? '')) {
  document.getElementById('back-link').href = `../#nui/${nuiId}`;
  showNuiPhoto();
}

// 写真は URL で渡されないので、ぬいの一覧から探す。取れないときは段階の顔のままにする
async function showNuiPhoto() {
  try {
    const nuis = await getNuis();
    const photoUrl = nuis.find((nui) => String(nui.id) === nuiId)?.photo_url;
    if (photoUrl) avatar.replaceWith(nuiAvatar({ name: nuiName, grudge, photo_url: photoUrl }, 'profile-avatar'));
  } catch (err) {
    console.warn('[ar] ぬいの写真が取れませんでした:', err.message);
  }
}

markerInput.addEventListener('change', async () => {
  const file = markerInput.files[0];
  if (!file) return;
  customMarker = await loadImage(URL.createObjectURL(file));
  markerPreview.src = customMarker.src;
  markerPreview.hidden = false;
});

function setStatus(text) {
  statusText.textContent = text;
  statusText.hidden = !text;
}

// マーカー画像から MindAR の照合データ（.mind）を作る。
// 同じ画像なら結果は同じなので、開いている間は使い回す。
const compiled = new Map();
async function compileTarget(img) {
  if (compiled.has(img.src)) return compiled.get(img.src);
  const data = await compileMarker(img, (progress) => {
    setStatus(`マーカーを準備しています… ${Math.round(progress)}%`);
  });
  const url = URL.createObjectURL(new Blob([data]));
  compiled.set(img.src, url);
  return url;
}

async function start() {
  startButton.disabled = true;
  try {
    const targetUrl = customMarker ? await compileTarget(customMarker) : STANDARD_TARGET;

    setStatus('カメラを起動しています…');
    const mindar = new MindARThree({
      container,
      imageTargetSrc: targetUrl,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'yes',
      ...TRACKING,
    });
    const { renderer, scene, camera } = mindar;

    // マーカーに重ねるもの。動くぬいはカメラ映像が要るので、起動後に足す
    const parts = [createHauntEffect(grudge)];
    const anchor = mindar.addAnchor(0);
    // 名札の傾きの分だけ戻して、演出をぬいの体の向きに合わせる
    const nuiBody = new THREE.Group();
    nuiBody.rotation.x = THREE.MathUtils.degToRad(-TAG_TILT_DEG);
    anchor.group.add(nuiBody);
    nuiBody.add(parts[0].object);
    anchor.onTargetFound = () => {
      parts.forEach((p) => p.setActive(true));
      setStatus('');
      navigator.vibrate?.(80);
    };
    anchor.onTargetLost = () => {
      parts.forEach((p) => p.setActive(false));
      setStatus(SCAN_MESSAGE);
    };

    await mindar.start();
    const puppet = createPuppet({ video: mindar.video, container, deform: hauntLook(grudge).deform });
    nuiBody.add(puppet.object);
    parts.push(puppet);
    startScreen.hidden = true;
    stopButton.hidden = false;
    setStatus(SCAN_MESSAGE);

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      // 見失っているあいだは位置が古いので、映像を切り取って動かす処理だけ止める
      puppet.setTracking(mindar.controller.trackingStates[0]?.isTracking ?? true);
      parts.forEach((p) => p.update(clock.elapsedTime, delta, camera));
      renderer.render(scene, camera);
    });
    session = { mindar, renderer };
    if (params.has('debug')) showDebugInfo(mindar);
  } catch (error) {
    // カメラが許可されないとき、MindAR は理由なしで失敗するので、よくある原因を出す
    console.error(error);
    container.replaceChildren();
    setStatus(error?.message ? `起動できませんでした: ${error.message}` : 'カメラを使えませんでした。カメラの許可と、HTTPS で開いているかを確かめてください。');
  } finally {
    startButton.disabled = false;
  }
}

// ?debug=1 のとき、実際のカメラの解像度と、1秒に何回認識の処理が回っているかを出す
function showDebugInfo(mindar) {
  const box = document.getElementById('debug');
  box.hidden = false;
  const { controller, video } = mindar;
  const onUpdate = controller.onUpdate;
  let frames = 0;
  controller.onUpdate = (data) => {
    if (data.type === 'processDone') frames += 1;
    onUpdate(data);
  };
  const timer = setInterval(() => {
    if (!session) {
      clearInterval(timer);
      box.hidden = true;
      return;
    }
    box.textContent = `カメラ ${video.videoWidth}×${video.videoHeight}、処理 ${frames} 回/秒`;
    frames = 0;
  }, 1000);
}

function stop() {
  if (!session) return;
  session.renderer.setAnimationLoop(null);
  session.mindar.stop();
  session.renderer.dispose();
  container.replaceChildren();
  session = null;
  stopButton.hidden = true;
  startScreen.hidden = false;
  setStatus('');
}

// カメラはブラウザーの決まりで、HTTPS か localhost でしか使えない
if (!window.isSecureContext) {
  startButton.disabled = true;
  setStatus('この URL ではカメラを使えません。HTTPS か localhost で開いてください。');
}

startButton.addEventListener('click', start);
stopButton.addEventListener('click', stop);
