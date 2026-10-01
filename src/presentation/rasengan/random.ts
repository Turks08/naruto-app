import * as THREE from 'three';

/** min 以上 max 未満の一様乱数。 */
export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 1 か -1 を等確率で返す。 */
export function randomSign(): number {
  return Math.random() < 0.5 ? -1 : 1;
}

/** 球面上に一様に分布するランダムな単位ベクトル。 */
export function randomUnitVector(): THREE.Vector3 {
  // z を一様に選び、残りを経度方向に振り分けると球面上で一様になる
  const z = randomRange(-1, 1);
  const longitude = randomRange(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(longitude), r * Math.sin(longitude), z);
}
