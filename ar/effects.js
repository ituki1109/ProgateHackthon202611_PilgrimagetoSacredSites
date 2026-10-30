import * as THREE from 'three';

// マーカーに重ねる「憑依」の演出。
// 座標の単位はマーカーの幅（= 1）。マーカーはぬいの名札なので、演出はぬいの体の中心に合わせて置く。

// 実物の大きさ。名札やぬいを変えたらここを直す
const MARKER_CM = 3;
const NUI_CM = 11;
// 名札がぬいの下から何割の高さに付いているか（お腹なら 0.4 くらい）
const TAG_HEIGHT_RATIO = 0.4;

// 演出の各部品は、高さ 1.5 くらいのぬいを想定した寸法で作ってあるので、実物に合わせて拡大する
const NUI_HEIGHT = NUI_CM / MARKER_CM;
const EFFECT_SCALE = NUI_HEIGHT / 1.5;

const LINES = ['ずっと放置してたよね…', 'やっと連れ出してくれた', 'ゆるさない…', 'もっと構って'];

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

function createBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.2, 0.375, 1);

  const draw = (text) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(20, 0, 30, 0.75)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 120, 40);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(220, 126);
    ctx.lineTo(256, 156);
    ctx.lineTo(270, 126);
    ctx.fill();
    ctx.fillStyle = '#f3e8ff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
    texture.needsUpdate = true;
  };
  return { sprite, draw };
}

export function createHauntEffect() {
  // root はぬいの体の中心に置き、body を揺らす
  const root = new THREE.Group();
  root.position.set(0, (0.5 - TAG_HEIGHT_RATIO) * NUI_HEIGHT, 0.05);
  const body = new THREE.Group();
  body.scale.setScalar(EFFECT_SCALE);
  root.add(body);

  const aura = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(160, 60, 255, 1)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  body.add(aura);

  // ぬいのまわりを回る人魂
  const wispTexture = glowTexture('rgba(110, 200, 255, 1)');
  const wisps = [0, 1, 2].map((i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: wispTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sprite.scale.setScalar(0.32);
    sprite.userData.phase = (i / 3) * Math.PI * 2;
    body.add(sprite);
    return sprite;
  });

  const bubble = createBubble();
  bubble.sprite.position.set(0, 0.95, 0.1);
  body.add(bubble.sprite);
  let lineIndex = 0;
  let lineTimer = 0;
  bubble.draw(LINES[lineIndex]);

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

    update(time, delta) {
      strength += (target - strength) * Math.min(1, delta * 3);
      root.visible = strength > 0.01;
      if (!root.visible) return;

      for (const m of materials) m.opacity = strength;

      // 怒りで小刻みに震えながら、ゆっくり上下する
      body.position.y = Math.sin(time * 2) * 0.05 * EFFECT_SCALE;
      body.rotation.z = Math.sin(time * 9) * 0.035;
      aura.scale.setScalar(1 + Math.sin(time * 3) * 0.08);

      wisps.forEach((w) => {
        const a = time * 1.6 + w.userData.phase;
        w.position.set(Math.cos(a) * 0.75, Math.sin(a * 1.3) * 0.25, Math.sin(a) * 0.35 + 0.1);
      });

      lineTimer += delta;
      if (lineTimer > 3) {
        lineTimer = 0;
        lineIndex = (lineIndex + 1) % LINES.length;
        bubble.draw(LINES[lineIndex]);
      }
    },
  };
}
