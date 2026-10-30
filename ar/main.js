import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { Compiler } from 'mindar-image';
import { createMarkerImage, loadImage } from './marker.js';
import { createHauntEffect } from './effects.js';
import { createPuppet } from './puppet.js';

const startScreen = document.getElementById('start');
const startButton = document.getElementById('start-button');
const markerInput = document.getElementById('marker-file');
const markerPreview = document.getElementById('marker-preview');
const statusText = document.getElementById('status');
const stopButton = document.getElementById('stop-button');
const container = document.getElementById('ar');

let customMarker = null;
let session = null;

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
  const compiler = new Compiler();
  await compiler.compileImageTargets([img], (progress) => {
    setStatus(`マーカーを準備しています… ${Math.round(progress)}%`);
  });
  const data = await compiler.exportData();
  const url = URL.createObjectURL(new Blob([data]));
  compiled.set(img.src, url);
  return url;
}

async function start() {
  startButton.disabled = true;
  try {
    const img = customMarker ?? (await createMarkerImage());
    const targetUrl = await compileTarget(img);

    setStatus('カメラを起動しています…');
    const mindar = new MindARThree({
      container,
      imageTargetSrc: targetUrl,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'yes',
    });
    const { renderer, scene, camera } = mindar;

    // マーカーに重ねるもの。動くぬいはカメラ映像が要るので、起動後に足す
    const parts = [createHauntEffect()];
    const anchor = mindar.addAnchor(0);
    anchor.group.add(parts[0].object);
    anchor.onTargetFound = () => {
      parts.forEach((p) => p.setActive(true));
      setStatus('');
      navigator.vibrate?.(80);
    };
    anchor.onTargetLost = () => {
      parts.forEach((p) => p.setActive(false));
      setStatus('ぬいの名札（マーカー）を映してください');
    };

    await mindar.start();
    const puppet = createPuppet({ video: mindar.video, container });
    anchor.group.add(puppet.object);
    parts.push(puppet);
    startScreen.hidden = true;
    stopButton.hidden = false;
    setStatus('ぬいの名札（マーカー）を映してください');

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      parts.forEach((p) => p.update(clock.elapsedTime, delta));
      renderer.render(scene, camera);
    });
    session = { mindar, renderer };
  } catch (error) {
    // カメラが許可されないとき、MindAR は理由なしで失敗するので、よくある原因を出す
    console.error(error);
    container.replaceChildren();
    setStatus(error?.message ? `起動できませんでした: ${error.message}` : 'カメラを使えませんでした。カメラの許可と、HTTPS で開いているかを確かめてください。');
  } finally {
    startButton.disabled = false;
  }
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

startButton.addEventListener('click', start);
stopButton.addEventListener('click', stop);
