import * as THREE from 'three';
import { NUI_HEIGHT, NUI_CENTER_Y, PARTS } from './config.js';

// カメラ映像の中のぬいを切り取り、変形させて重ねることで、ぬいが動いて見えるようにする。
//
// ぬいの位置に板を置き、板の各点が「変形する前に」画面のどこに映るかを計算して、
// その位置のカメラ映像を貼る。板を変形させると、貼った映像（= ぬい）も一緒に動く。
// 動いたあとに本物のぬいが残って見えないよう、その下にまわりの床の色で塗りつぶす板（cover）も敷く。

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uDeform;
  uniform float uNuiHeight;
  uniform vec2 uCenter;
  uniform float uNeckY;
  uniform float uArmY;
  uniform float uArmInnerX;
  uniform float uArmOuterX;
  varying vec3 vLocal;

  vec2 rotateAround(vec2 p, vec2 pivot, float angle) {
    p -= pivot;
    float c = cos(angle);
    float s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y) + pivot;
  }

  void main() {
    vLocal = position;
    // ぬいの高さを 1、体の中心を 0 とした座標
    vec2 q = (position.xy - uCenter) / uNuiHeight;
    float k = uStrength * uDeform;

    // 腕: 肩を支点に、左右の腕を交互に振る
    float side = sign(q.x);
    float armWeight = smoothstep(uArmInnerX, uArmOuterX, abs(q.x)) * (1.0 - smoothstep(0.04, 0.16, abs(q.y - uArmY)));
    vec2 shoulder = vec2(side * uArmInnerX, uArmY);
    float armAngle = side * (0.35 + 0.35 * sin(uTime * 8.0 + side * 1.6)) * k;
    q = mix(q, rotateAround(q, shoulder, armAngle), armWeight);

    // 頭: 首から上をゆっくり傾ける
    float headWeight = smoothstep(uNeckY - 0.05, uNeckY + 0.12, q.y);
    q = mix(q, rotateAround(q, vec2(0.0, uNeckY), sin(uTime * 2.3) * 0.16 * k), headWeight);

    // 体全体: 足もとを支点に左右へ揺れ、ぴょんぴょん跳ねる
    float hop = abs(sin(uTime * 4.0));
    q.y = (q.y + 0.5) * (1.0 + (hop - 0.5) * 0.08 * k) - 0.5;
    q.x *= 1.0 - (hop - 0.5) * 0.05 * k;
    q = rotateAround(q, vec2(0.0, -0.5), sin(uTime * 2.0) * 0.1 * k);
    q.y += hop * 0.06 * k;

    vec3 p = vec3(q * uNuiHeight + uCenter, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

// 板の上の点を、カメラ映像の中の位置に変える
const videoUvChunk = /* glsl */ `
  uniform sampler2D uVideo;
  uniform mat4 uProjectOriginal;
  uniform vec2 uContainer;
  uniform vec4 uVideoRect;
  uniform float uNuiHeight;
  uniform vec2 uCenter;
  uniform vec2 uOutline;
  uniform float uStrength;
  varying vec3 vLocal;

  vec2 videoUv(vec3 local) {
    vec4 clip = uProjectOriginal * vec4(local, 1.0);
    vec2 ndc = clip.xy / clip.w;
    vec2 px = vec2((ndc.x * 0.5 + 0.5) * uContainer.x, (0.5 - ndc.y * 0.5) * uContainer.y);
    vec2 uv = (px - uVideoRect.xy) / uVideoRect.zw;
    return vec2(uv.x, 1.0 - uv.y);
  }

  // 楕円の輪郭に対する位置（中心 0、輪郭 1）
  vec2 toOutline(vec3 local) {
    return (local.xy - uCenter) / uNuiHeight / uOutline;
  }
`;

const puppetFragment = /* glsl */ `
  ${videoUvChunk}
  void main() {
    float e = length(toOutline(vLocal));
    float alpha = (1.0 - smoothstep(0.82, 1.0, e)) * uStrength;
    gl_FragColor = vec4(texture2D(uVideo, videoUv(vLocal)).rgb, alpha);
  }
`;

// 楕円の内側を、すぐ外側の映像を引き伸ばして塗る（簡単な穴埋め）
const coverFragment = /* glsl */ `
  ${videoUvChunk}
  void main() {
    vec2 o = toOutline(vLocal);
    float e = length(o);
    vec2 dir = o / max(e, 0.001);
    vec3 color = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float r = 1.08 + float(i) * 0.08;
      vec2 outside = dir * r * uOutline * uNuiHeight + uCenter;
      color += texture2D(uVideo, videoUv(vec3(outside, vLocal.z))).rgb;
    }
    float alpha = (1.0 - smoothstep(0.95, 1.08, e)) * uStrength;
    gl_FragColor = vec4(color / 3.0, alpha);
  }
`;

export function createPuppet({ video, container }) {
  const texture = new THREE.VideoTexture(video);
  const [rx, ry] = PARTS.outline;
  const center = new THREE.Vector2(0, NUI_CENTER_Y);

  const uniforms = {
    uVideo: { value: texture },
    uProjectOriginal: { value: new THREE.Matrix4() },
    uContainer: { value: new THREE.Vector2() },
    uVideoRect: { value: new THREE.Vector4() },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uDeform: { value: 1 },
    uNuiHeight: { value: NUI_HEIGHT },
    uCenter: { value: center },
    uOutline: { value: new THREE.Vector2(rx, ry) },
    uNeckY: { value: PARTS.neckY },
    uArmY: { value: PARTS.armY },
    uArmInnerX: { value: PARTS.armInnerX },
    uArmOuterX: { value: PARTS.armOuterX },
  };

  // 楕円を覆う板（少し大きめ）。変形させるので細かく分割する
  const geometry = new THREE.PlaneGeometry(rx * 2.6 * NUI_HEIGHT, ry * 2.4 * NUI_HEIGHT, 40, 40);
  geometry.translate(center.x, center.y, 0.01);

  const common = { uniforms, vertexShader, transparent: true, depthTest: false, depthWrite: false };
  const cover = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({ ...common, fragmentShader: coverFragment, uniforms: { ...uniforms, uDeform: { value: 0 } } }),
  );
  const puppet = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ ...common, fragmentShader: puppetFragment }));
  cover.renderOrder = 1;
  puppet.renderOrder = 2;

  // 変形する前の位置で映像を取るため、描く直前のカメラとの位置関係を渡す
  puppet.onBeforeRender = (renderer, scene, camera) => {
    uniforms.uProjectOriginal.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(puppet.matrixWorld);
    uniforms.uContainer.value.set(container.clientWidth, container.clientHeight);
    uniforms.uVideoRect.value.set(
      parseFloat(video.style.left) || 0,
      parseFloat(video.style.top) || 0,
      parseFloat(video.style.width) || container.clientWidth,
      parseFloat(video.style.height) || container.clientHeight,
    );
  };
  cover.onBeforeRender = puppet.onBeforeRender;

  const group = new THREE.Group();
  group.add(cover, puppet);

  let target = 0;
  return {
    object: group,

    setActive(active) {
      target = active ? 1 : 0;
      if (active) uniforms.uStrength.value = 0;
    },

    update(time, delta) {
      const u = uniforms.uStrength;
      u.value += (target - u.value) * Math.min(1, delta * 3);
      group.visible = u.value > 0.01;
      uniforms.uTime.value = time;
    },
  };
}
