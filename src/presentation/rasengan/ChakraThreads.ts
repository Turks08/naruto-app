import * as THREE from 'three';
import { BASE_RADIUS, RENDER_ORDER } from './constants.js';
import { randomRange, randomSign, randomUnitVector } from './random.js';
import { THREAD_FRAGMENT_SHADER, THREAD_VERTEX_SHADER } from './shaders.js';

const THREAD_COUNT = 260;
/** 1本の線を折れ線で近似するときの分割数。 */
const THREAD_SEGMENTS = 40;
const POINTS_PER_THREAD = THREAD_SEGMENTS + 1;

/** 線を置く殻の半径の範囲(BASE_RADIUSに対する比率)。波打ち分を含めても球からはみ出さないよう 1 未満に収める。 */
const SHELL_RADIUS_MIN = 0.45;
const SHELL_RADIUS_MAX = 0.92;
/** 1本の線の長さ(円弧の角度、度)。 */
const ARC_DEGREES_MIN = 80;
const ARC_DEGREES_MAX = 280;
/** 線が回る角速度(rad/s)の大きさ。向きは線ごとにランダム。 */
const SPIN_SPEED_MIN = 0.6;
const SPIN_SPEED_MAX = 2.2;

const THREAD_COLOR = 0xe6fbff;
/** 完全に出現したときの線の不透明度。 */
const THREAD_OPACITY = 0.55;

/** 1本の線の形と動き。 */
interface ThreadShape {
  /** 円弧が乗る平面の直交基底(この2軸で張る平面上に円弧を描く)。 */
  u: THREE.Vector3;
  v: THREE.Vector3;
  radius: number;
  startAngle: number;
  arcAngle: number;
  /** 完全な円弧だと機械的に見えるので、半径を少し波打たせる。 */
  wobbleAmplitude: number;
  wobbleFrequency: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
}

function randomThreadShape(): ThreadShape {
  // 円弧の平面の法線をランダムに選び、それに直交する2軸を作る
  const normal = randomUnitVector();
  const reference = Math.abs(normal.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = reference.cross(normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);

  const radius = BASE_RADIUS * randomRange(SHELL_RADIUS_MIN, SHELL_RADIUS_MAX);
  return {
    u,
    v,
    radius,
    startAngle: randomRange(0, Math.PI * 2),
    arcAngle: THREE.MathUtils.degToRad(randomRange(ARC_DEGREES_MIN, ARC_DEGREES_MAX)),
    wobbleAmplitude: radius * randomRange(0.02, 0.08),
    wobbleFrequency: Math.floor(randomRange(2, 6)),
    spinAxis: randomUnitVector(),
    spinSpeed: randomRange(SPIN_SPEED_MIN, SPIN_SPEED_MAX) * randomSign()
  };
}

/**
 * 全ての線を1つの LineSegments 用ジオメトリにまとめる。
 * 回転は頂点シェーダーで行うため、頂点ごとに回転軸・角速度・線上の位置も持たせる。
 */
function createThreadsGeometry(): THREE.BufferGeometry {
  const pointCount = THREAD_COUNT * POINTS_PER_THREAD;
  const positions = new Float32Array(pointCount * 3);
  const spinAxes = new Float32Array(pointCount * 3);
  const spinSpeeds = new Float32Array(pointCount);
  const alongs = new Float32Array(pointCount);
  const indices: number[] = [];
  const point = new THREE.Vector3();

  for (let thread = 0; thread < THREAD_COUNT; thread++) {
    const shape = randomThreadShape();

    for (let i = 0; i < POINTS_PER_THREAD; i++) {
      const along = i / THREAD_SEGMENTS; // 線の始点(0)〜終点(1)
      const angle = shape.startAngle + along * shape.arcAngle;
      const r = shape.radius + Math.sin(along * Math.PI * shape.wobbleFrequency) * shape.wobbleAmplitude;
      point
        .copy(shape.u).multiplyScalar(Math.cos(angle))
        .addScaledVector(shape.v, Math.sin(angle))
        .multiplyScalar(r);

      const index = thread * POINTS_PER_THREAD + i;
      point.toArray(positions, index * 3);
      shape.spinAxis.toArray(spinAxes, index * 3);
      spinSpeeds[index] = shape.spinSpeed;
      alongs[index] = along;
      // 隣り合う点を結んで折れ線にする
      if (i > 0) indices.push(index - 1, index);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAxis', new THREE.BufferAttribute(spinAxes, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(spinSpeeds, 1));
  geometry.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1));
  geometry.setIndex(indices);
  return geometry;
}

// 球の中で絡み合うように回るチャクラの細い線(毛糸玉のような見た目)。
// 半径の違う殻の上に向きのばらばらな円弧を置き、1本ずつ別の軸・速さで回す。
// 手前の線と奥の線が違う方向に流れるため、平面の模様ではなく立体の線の塊に見える。
export class ChakraThreads {
  readonly object: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(THREAD_COLOR) },
        uOpacity: { value: 0 }
      },
      vertexShader: THREAD_VERTEX_SHADER,
      fragmentShader: THREAD_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending, // 青い球の上で白く光らせる
      depthWrite: false,
      depthTest: false
    });

    this.object = new THREE.LineSegments(createThreadsGeometry(), this.material);
    this.object.renderOrder = RENDER_ORDER.threads;
    this.object.frustumCulled = false; // 頂点をシェーダー側で回すため、バウンディング計算に頼らない
  }

  /**
   * @param age 出現してからの経過秒数(線の回転角に使う)
   * @param presence 0..1。出現の度合い
   */
  update(age: number, presence: number): void {
    this.material.uniforms.uTime.value = age;
    this.material.uniforms.uOpacity.value = THREAD_OPACITY * presence;
  }
}
