// ぬいと名札の寸法。名札やぬいを変えたらここを直す。
// 座標の単位はマーカーの幅（= 1）で、原点はマーカーの中心。
// 値は録画に映ったぬいから測った。URL で ?markerCm=3&nuiCm=14&tagRatio=0.36&tilt=10 のように渡すと、直さずに試せる。

const params = new URLSearchParams(location.search);
const value = (name, fallback) => {
  const number = Number(params.get(name));
  return params.has(name) && Number.isFinite(number) ? number : fallback;
};

// 名札の幅。3cm では少し離すと認識しにくかったので 4cm にした（marker.html の印刷の大きさにも使う）
export const MARKER_CM = value('markerCm', 4);
export const NUI_CM = value('nuiCm', 14);
// 名札の中心がぬいの下から何割の高さにあるか
export const TAG_HEIGHT_RATIO = value('tagRatio', 0.36);
// 名札の上側がぬいの体より手前に傾いている角度。ふわふわのお腹に付けると傾きやすい
export const TAG_TILT_DEG = value('tilt', 0);

// 画面の中で名札を消すか。?hideTag=0 で元の見え方に戻せる
export const HIDE_TAG = value('hideTag', 1) !== 0;

export const NUI_HEIGHT = NUI_CM / MARKER_CM;
// ぬいの体の中心（マーカーの中心から見た高さ）
export const NUI_CENTER_Y = (0.5 - TAG_HEIGHT_RATIO) * NUI_HEIGHT;

// ぬいを動かすときの部位の位置。ぬいの高さを 1、体の中心を 0 とした値（下端が -0.5、上端が 0.5）
export const PARTS = {
  // ぬいの輪郭として切り取る楕円の半径（横、縦）
  outline: [0.44, 0.54],
  // 首の高さ。ここから上を頭として傾ける
  neckY: 0.05,
  // 腕の高さと、腕が始まる横の位置（肩）、腕の先までの位置
  armY: -0.08,
  armInnerX: 0.2,
  armOuterX: 0.42,
  // 腕の振りの大きさ（1 で元の大きさ）。毛に埋もれた腕を大きく振ると、毛の輪郭がゆがんで見える
  armSwing: 0.35,
};
