// ぬいと名札の寸法。名札やぬいを変えたらここを直す。
// 座標の単位はマーカーの幅（= 1）で、原点はマーカーの中心。

export const MARKER_CM = 3;
export const NUI_CM = 11;
// 名札がぬいの下から何割の高さに付いているか（お腹なら 0.4 くらい）
export const TAG_HEIGHT_RATIO = 0.4;

export const NUI_HEIGHT = NUI_CM / MARKER_CM;
// ぬいの体の中心（マーカーの中心から見た高さ）
export const NUI_CENTER_Y = (0.5 - TAG_HEIGHT_RATIO) * NUI_HEIGHT;

// ぬいを動かすときの部位の位置。ぬいの高さを 1、体の中心を 0 とした値（下端が -0.5、上端が 0.5）
export const PARTS = {
  // ぬいの輪郭として切り取る楕円の半径（横、縦）
  outline: [0.5, 0.55],
  // 首の高さ。ここから上を頭として傾ける
  neckY: 0.0,
  // 腕の高さと、腕が始まる横の位置（肩）、腕の先までの位置
  armY: -0.08,
  armInnerX: 0.2,
  armOuterX: 0.42,
};
