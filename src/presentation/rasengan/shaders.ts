// 螺旋丸の各レイヤーで使う GLSL シェーダー。
// 出力は #include <colorspace_fragment> で sRGB に変換し、THREE.Color で指定した色がそのまま出るようにしている。

const PI = '3.14159265';

// 頂点が球の中心より手前(+1)か奥(-1)かを返す。中心からの距離で割るので、スケールに依存しない。
// 線や風の弧の、球の奥に回り込んだ部分を暗くするのに使う。
const FRONTNESS_FUNCTION = `
  float frontness(vec4 mvPosition) {
    vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 rel = mvPosition.xyz - center.xyz;
    return rel.z / max(length(rel), 1e-4);
  }
`;

// ---- 球本体 ----

export const BODY_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// 視線と法線の向きがそろう正面(球の中心付近)ほど白っぽい水色、縁ほど濃い青にする。
// 縁のごく外周は不透明度を落とし、ハローとつながる柔らかい輪郭にする。
// 出力は乗算済みアルファ(色に不透明度を掛けた値)。
export const BODY_FRAGMENT_SHADER = `
  uniform vec3 uEdgeColor;
  uniform vec3 uMidColor;
  uniform vec3 uCenterColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float facing = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);

    vec3 color = mix(uEdgeColor, uMidColor, smoothstep(0.0, 0.75, facing));
    color = mix(color, uCenterColor, pow(facing, 6.0) * 0.7);
    // 中心のごく狭い範囲だけを白くする(指数を大きくするほど白い範囲が小さくなる)
    color = mix(color, vec3(1.0), pow(facing, 40.0));

    float alpha = uOpacity * smoothstep(0.0, 0.25, facing);
    gl_FragColor = vec4(color * alpha, alpha);
    #include <colorspace_fragment>
  }
`;

// ---- チャクラの線 ----

// 頂点ごとに持つ回転軸(aAxis)・角速度(aSpeed)で、線を1本ずつ別々に回す。
// aAlong は線の始点(0)〜終点(1)の位置で、両端のフェードに使う。
export const THREAD_VERTEX_SHADER = `
  attribute vec3 aAxis;
  attribute float aSpeed;
  attribute float aAlong;
  uniform float uTime;
  varying float vFront;
  varying float vAlong;

  ${FRONTNESS_FUNCTION}

  // ロドリゲスの回転公式で、単位ベクトル axis まわりに angle だけ回す
  vec3 rotateAround(vec3 v, vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  void main() {
    vAlong = aAlong;
    vec3 rotated = rotateAround(position, aAxis, uTime * aSpeed);
    vec4 mvPosition = modelViewMatrix * vec4(rotated, 1.0);
    vFront = frontness(mvPosition);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// 線の両端をフェードさせ、球の奥側を通る部分は暗くする(半透明の球の向こうに透けて見える表現)。
export const THREAD_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFront;
  varying float vAlong;
  void main() {
    float endFade = sin(vAlong * ${PI});
    float depthFade = mix(0.3, 1.0, smoothstep(-0.6, 0.4, vFront));
    gl_FragColor = vec4(uColor, uOpacity * endFade * depthFade);
    #include <colorspace_fragment>
  }
`;

// ---- 風の弧 ----

export const WIND_ARC_VERTEX_SHADER = `
  varying vec2 vUv;
  varying float vFront;

  ${FRONTNESS_FUNCTION}

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFront = frontness(mvPosition);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// 筋のテクスチャを弧に沿ってスクロールさせて流れを出す
// (https://github.com/ics-creative/160907_magma_effect の Flare.ts と同じ手法)。
// 帯の幅方向(vUv.y)と弧の両端(vUv.x)をフェードさせ、ふわっと途切れる薄い風にする。
// 球の奥側に回り込んだ部分は暗くし、球の向こうを通っているように見せる。
export const WIND_ARC_FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform vec2 offset;
  uniform vec3 tint;
  uniform float maxOpacity;
  varying vec2 vUv;
  varying float vFront;
  void main() {
    vec4 streak = texture2D(map, vUv * vec2(3.0, 1.0) + offset);
    float widthFade = sin(vUv.y * ${PI});
    float endFade = pow(sin(vUv.x * ${PI}), 0.8);
    float depthFade = mix(0.25, 1.0, smoothstep(-0.5, 0.5, vFront));
    float alpha = (0.55 + streak.a * 0.45) * widthFade * endFade * depthFade * maxOpacity;
    gl_FragColor = vec4(tint, alpha);
    #include <colorspace_fragment>
  }
`;
