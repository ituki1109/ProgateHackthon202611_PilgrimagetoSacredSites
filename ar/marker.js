// 標準マーカーの模様を作る。
// 同じ種から毎回同じ模様を描くので、印刷したマーカーとアプリが照合する画像が一致する。
// 端末ごとに字形が変わらないよう、文字は使わず図形だけで描く。

export const MARKER_SIZE = 1024;
export const DEFAULT_SEED = 20261107;

// 種つきの疑似乱数（mulberry32）
function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawMarker(canvas, seed = DEFAULT_SEED) {
  const size = MARKER_SIZE;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = createRandom(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  // 太い黒枠
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, size, size);
  const margin = 56;
  ctx.fillStyle = '#fff';
  ctx.fillRect(margin, margin, size - margin * 2, size - margin * 2);

  // 角が多いほど追跡しやすいので、大きさと向きの違う図形を重ならないよう散らす
  const inner = size - margin * 2;
  const colors = ['#111', '#111', '#333', '#666'];
  for (let i = 0; i < 110; i++) {
    const x = margin + 30 + rand() * (inner - 60);
    const y = margin + 30 + rand() * (inner - 60);
    const r = 14 + rand() * 46;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI * 2);
    ctx.fillStyle = pick(colors);
    ctx.strokeStyle = ctx.fillStyle;
    switch (Math.floor(rand() * 4)) {
      case 0:
        ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
        break;
      case 1:
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.9, r * 0.8);
        ctx.lineTo(-r * 0.9, r * 0.8);
        ctx.closePath();
        ctx.fill();
        break;
      case 2:
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.8, 0, Math.PI * 1.5);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
        break;
      default:
        ctx.lineWidth = 8 + rand() * 10;
        ctx.beginPath();
        ctx.moveTo(-r * 1.4, 0);
        ctx.lineTo(r * 1.4, 0);
        ctx.lineTo(r * 1.4, r);
        ctx.stroke();
    }
    ctx.restore();
  }

  // 中央のおばけ。向きの手がかりにもなる
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2 - 40, 150, Math.PI, 0);
  ctx.lineTo(size / 2 + 150, size / 2 + 150);
  for (let k = 0; k < 4; k++) {
    const x0 = size / 2 + 150 - k * 75;
    ctx.lineTo(x0 - 37, size / 2 + 110);
    ctx.lineTo(x0 - 75, size / 2 + 150);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(size / 2 - 55, size / 2 - 40, 26, 40, 0, 0, Math.PI * 2);
  ctx.ellipse(size / 2 + 55, size / 2 - 40, 26, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(size / 2 - 60, size / 2 + 40, 120, 18);

  return canvas;
}

// MindAR のコンパイラーに渡せる画像要素として返す
export function createMarkerImage(seed = DEFAULT_SEED) {
  const canvas = drawMarker(document.createElement('canvas'), seed);
  return loadImage(canvas.toDataURL('image/png'));
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = src;
  });
}
