import * as THREE from 'three';
import { BASE_RADIUS, RENDER_ORDER } from './constants.js';
import { randomRange, randomUnitVector } from './random.js';
import { WIND_ARC_FRAGMENT_SHADER, WIND_ARC_VERTEX_SHADER } from './shaders.js';
import { makeWindStreakTexture } from './textures.js';

const ARC_COUNT = 7;
/** 弧の半径の範囲(BASE_RADIUSに対する比率)。球より大きく外側を回る。 */
const ARC_RADIUS_MIN = 1.6;
const ARC_RADIUS_MAX = 3.2;
/** 帯の幅(弧の半径に対する比率)。 */
const ARC_WIDTH_MIN = 0.03;
const ARC_WIDTH_MAX = 0.08;
/** 弧の長さ(度)。 */
const ARC_DEGREES_MIN = 90;
const ARC_DEGREES_MAX = 200;

/** 弧ごとに交互に使う色。 */
const ARC_COLORS = [0x5b9bff, 0x8fc2ff];
/** 完全に出現したときの不透明度。 */
const ARC_OPACITY = 0.45;

interface WindArc {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** 弧の面内で回る角速度(rad/s)。球の周りを掃くように回る。 */
  sweepSpeed: number;
  /** 弧の面そのものをゆっくり傾け続ける回転軸と角速度。 */
  tumbleAxis: THREE.Vector3;
  tumbleSpeed: number;
  /** 筋のテクスチャを流す速さ。 */
  scrollSpeed: number;
}

/**
 * 半径 innerRadius から outerRadius までの帯を、角度 arcAngle 分だけ切り出した弧の面を作る(XZ平面上)。
 * UV は u が弧に沿った方向(0..1)、v が帯の内側→外側(0..1)。
 * https://github.com/ics-creative/160907_magma_effect の Flare.ts のリング生成を、弧を切り出せるよう拡張したもの。
 */
function createArcGeometry(innerRadius: number, outerRadius: number, arcAngle: number): THREE.BufferGeometry {
  const arcSegments = 48;
  const widthSegments = 3;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= widthSegments; y++) {
    const v = y / widthSegments;
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, v);

    for (let x = 0; x <= arcSegments; x++) {
      const u = x / arcSegments;
      const angle = u * arcAngle;
      positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      uvs.push(u, v);
    }
  }

  // 格子状に並べた頂点を、1マスにつき2枚の三角形で埋める
  const stride = arcSegments + 1;
  for (let y = 0; y < widthSegments; y++) {
    for (let x = 0; x < arcSegments; x++) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// 球の外側を大きく回る、薄く半透明な風の弧。
// 半径・幅・長さ・傾きがばらばらの弧を、それぞれ面内で回しつつ面ごと傾け続けることで、
// 球を中心に風が渦巻いているように見せる。球の奥に回り込んだ部分はシェーダーで暗くする。
export class WindArcs {
  readonly object = new THREE.Group();
  private readonly arcs: WindArc[] = [];

  constructor() {
    const texture = makeWindStreakTexture();
    for (let i = 0; i < ARC_COUNT; i++) {
      this.arcs.push(this.#createArc(texture, ARC_COLORS[i % ARC_COLORS.length]));
    }
  }

  /**
   * @param dt 前フレームからの経過秒数
   * @param age 出現してからの経過秒数(テクスチャのスクロール量に使う)
   * @param presence 0..1。出現の度合い
   */
  update(dt: number, age: number, presence: number): void {
    this.arcs.forEach(arc => {
      // 全ての弧が同じ向き(-Y まわり)に回るようにして、全体として1方向に渦巻かせる
      arc.mesh.rotateY(-arc.sweepSpeed * dt);
      arc.mesh.rotateOnAxis(arc.tumbleAxis, arc.tumbleSpeed * dt);
      arc.material.uniforms.offset.value.set(age * arc.scrollSpeed, 0);
      arc.material.uniforms.maxOpacity.value = ARC_OPACITY * presence;
    });
  }

  #createArc(texture: THREE.Texture, color: number): WindArc {
    const radius = BASE_RADIUS * randomRange(ARC_RADIUS_MIN, ARC_RADIUS_MAX);
    const width = radius * randomRange(ARC_WIDTH_MIN, ARC_WIDTH_MAX);
    const arcAngle = THREE.MathUtils.degToRad(randomRange(ARC_DEGREES_MIN, ARC_DEGREES_MAX));
    const geometry = createArcGeometry(radius - width / 2, radius + width / 2, arcAngle);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        offset: { value: new THREE.Vector2() },
        tint: { value: new THREE.Color(color) },
        maxOpacity: { value: 0 }
      },
      vertexShader: WIND_ARC_VERTEX_SHADER,
      fragmentShader: WIND_ARC_FRAGMENT_SHADER,
      // 明るい背景の上でも青く見えるよう、加算ではなく通常の半透明合成にする
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(randomRange(0, Math.PI), randomRange(0, Math.PI), randomRange(0, Math.PI));
    mesh.renderOrder = RENDER_ORDER.windArcs;
    this.object.add(mesh);

    return {
      mesh,
      material,
      sweepSpeed: randomRange(1.6, 3.2),
      tumbleAxis: randomUnitVector(),
      tumbleSpeed: randomRange(0.2, 0.5),
      scrollSpeed: randomRange(0.3, 0.7)
    };
  }
}
