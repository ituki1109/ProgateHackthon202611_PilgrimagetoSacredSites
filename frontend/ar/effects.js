import * as THREE from 'three';
import { grudgeStage } from '../js/ui.js';
import { NUI_HEIGHT, NUI_CENTER_Y } from './config.js';

// マーカーに重ねる「憑依」の演出。
// 座標の単位はマーカーの幅（= 1）。マーカーはぬいの名札なので、演出はぬいの体の中心に合わせて置く。

// 演出の各部品は、高さ 1.5 くらいのぬいを想定した寸法で作ってあるので、実物に合わせて拡大する
const EFFECT_SCALE = NUI_HEIGHT / 1.5;

// 怨念の段階ごとの見せ方。aura と wisp は光の色、wisps は人魂の数、shake は震えの強さ、deform はぬいの動きの大きさ
const LOOKS = {
  strong: { aura: 'rgba(225, 40, 70, 1)', wisp: 'rgba(255, 130, 90, 1)', wisps: 3, shake: 1, deform: 1 },
  medium: { aura: 'rgba(160, 60, 255, 1)', wisp: 'rgba(110, 200, 255, 1)', wisps: 3, shake: 0.6, deform: 0.75 },
  weak: { aura: 'rgba(90, 140, 255, 1)', wisp: 'rgba(110, 200, 255, 1)', wisps: 2, shake: 0.25, deform: 0.5 },
  calm: { aura: 'rgba(255, 225, 140, 1)', wisp: 'rgba(255, 225, 140, 1)', wisps: 0, shake: 0, deform: 0.3 },
};

// 吹き出しの位置。頭の上に出す。顔に重ならないよう、ぬいの上端（0.75）より少し上に置く
const BUBBLE_POSITION = new THREE.Vector3(0, 0.85, 0.1);
// 吹き出しの中心が、画面のこの範囲（中心 0、端 1）から出ないようにする
const BUBBLE_LIMIT = { x: 0.7, y: 0.82 };

export function hauntLook(grudge) {
  return LOOKS[grudgeStage(grudge).key];
}

function glowTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.45)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

// オーラの輪。真ん中まで光らせると、明るい色のぬいが白く飛んで見えなくなるので、ぬいの外側だけを光らせる
function ringTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, color.replace(/[\d.]+\)$/, '0)'));
  g.addColorStop(0.68, color.replace(/[\d.]+\)$/, '0)'));
  g.addColorStop(0.82, color.replace(/[\d.]+\)$/, '0.6)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

// ぬいが画面いっぱいに映ると吹き出しが外へ出るので、はみ出す分だけ内側へ寄せる
function keepOnScreen(sprite, camera) {
  const project = (dx, dy) => {
    sprite.position.set(BUBBLE_POSITION.x + dx, BUBBLE_POSITION.y + dy, BUBBLE_POSITION.z);
    sprite.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld).project(camera);
  };
  const home = project(0, 0);
  const perX = project(1, 0).x - home.x;
  const perY = project(0, 1).y - home.y;
  const overflow = (value, limit) => (value > limit ? limit - value : value < -limit ? -limit - value : 0);
  const dx = perX ? overflow(home.x, BUBBLE_LIMIT.x) / perX : 0;
  const dy = perY ? overflow(home.y, BUBBLE_LIMIT.y) / perY : 0;
  sprite.position.set(BUBBLE_POSITION.x + dx, BUBBLE_POSITION.y + dy, BUBBLE_POSITION.z);
}

function createBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.72, 0.225, 1);

  const draw = (text) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(20, 20, 20, 0.82)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 120, 40);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(220, 126);
    ctx.lineTo(256, 156);
    ctx.lineTo(270, 126);
    ctx.fill();
    ctx.fillStyle = '#fff';
    // 長いセリフは、吹き出しに収まるまで文字を小さくする
    let size = 44;
    do {
      ctx.font = `bold ${size}px sans-serif`;
      size -= 2;
    } while (ctx.measureText(text).width > 456 && size > 20);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
    texture.needsUpdate = true;
  };
  return { sprite, draw };
}

export function createHauntEffect(grudge) {
  const look = hauntLook(grudge);
  // root はぬいの体の中心に置き、body を揺らす
  const root = new THREE.Group();
  root.position.set(0, NUI_CENTER_Y, 0.05);
  const body = new THREE.Group();
  body.scale.setScalar(EFFECT_SCALE);
  root.add(body);

  const aura = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({
      map: ringTexture(look.aura),
      transparent: true,
      depthWrite: false,
    }),
  );
  body.add(aura);

  // ぬいのまわりを回る人魂
  const wispTexture = glowTexture(look.wisp);
  const wisps = Array.from({ length: look.wisps }, (_, i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: wispTexture, transparent: true, depthWrite: false }),
    );
    sprite.scale.setScalar(0.2);
    sprite.userData.phase = (i / look.wisps) * Math.PI * 2;
    body.add(sprite);
    return sprite;
  });

  const bubble = createBubble();
  bubble.sprite.position.copy(BUBBLE_POSITION);
  body.add(bubble.sprite);
  bubble.draw(grudgeStage(grudge).line);

  // 動くぬい（puppet.js）より手前に描く
  root.traverse((o) => {
    o.renderOrder = 3;
  });

  const materials = [aura.material, bubble.sprite.material, ...wisps.map((w) => w.material)];
  let strength = 0;
  let target = 0;

  return {
    object: root,

    setActive(active) {
      target = active ? 1 : 0;
      if (active) {
        // 見つけ直すたびに、ふわっと出てくるようにする
        strength = 0;
      }
    },

    update(time, delta, camera) {
      strength += (target - strength) * Math.min(1, delta * 3);
      root.visible = strength > 0.01;
      if (!root.visible) return;

      for (const m of materials) m.opacity = strength;

      // 怒りで小刻みに震えながら、ゆっくり上下する
      body.position.y = Math.sin(time * 2) * 0.05 * EFFECT_SCALE;
      body.rotation.z = Math.sin(time * 9) * 0.035 * look.shake;
      // ぬいは縦に長いので、輪も少し縦長にする
      const pulse = 1 + Math.sin(time * 3) * 0.04;
      aura.scale.set(pulse * 0.86, pulse, 1);

      wisps.forEach((w) => {
        const a = time * 1.6 + w.userData.phase;
        w.position.set(Math.cos(a) * 0.75, Math.sin(a * 1.3) * 0.25, Math.sin(a) * 0.35 + 0.1);
      });

      keepOnScreen(bubble.sprite, camera);
    },
  };
}
