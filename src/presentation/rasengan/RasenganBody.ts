import * as THREE from 'three';
import { BASE_RADIUS, RENDER_ORDER } from './constants.js';
import { BODY_FRAGMENT_SHADER, BODY_VERTEX_SHADER } from './shaders.js';
import { makeCoreGlowTexture, makeHaloTexture } from './textures.js';

/** 縁の外側に広がるハローの直径(球の直径に対する比率)。 */
const HALO_SCALE = 1.45;
/** 中心の白い光の直径(球の直径に対する比率)。 */
const CORE_GLOW_SCALE = 0.55;

const COLORS = {
  edge: 0x0b5cff, // 縁の濃い青
  mid: 0x22a8ff, // 中間の水色
  center: 0xc8f4ff // 中心付近の白っぽい水色
};

/** 完全に出現したときの不透明度。 */
const BODY_OPACITY = 0.92;
const CORE_GLOW_OPACITY = 0.9;
/** 出現の瞬間の膨らみ(pulse=1)で、ハローをどれだけ強めるか。 */
const HALO_PULSE_BOOST = 0.5;

// 螺旋丸の球本体。3つの層を奥から順に重ねる。
// - ハロー: 球の背後のビルボード。輪郭のすぐ外側だけが見え、縁がにじんで光っているように見える
// - 球: 正面ほど白っぽい水色、縁ほど濃い青の半透明の球。明るい背景の上でも青く見えるよう、通常の半透明合成で背景を覆う
// - 中心の光: 白い光の玉を加算で重ね、暗い背景でも中心が白く光って見えるようにする
export class RasenganBody {
  readonly object = new THREE.Group();
  private readonly haloMaterial: THREE.SpriteMaterial;
  private readonly sphereMaterial: THREE.ShaderMaterial;
  private readonly coreGlowMaterial: THREE.SpriteMaterial;

  constructor() {
    this.haloMaterial = new THREE.SpriteMaterial({
      map: makeHaloTexture(),
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    this.#addSprite(this.haloMaterial, HALO_SCALE, RENDER_ORDER.halo);

    this.sphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uEdgeColor: { value: new THREE.Color(COLORS.edge) },
        uMidColor: { value: new THREE.Color(COLORS.mid) },
        uCenterColor: { value: new THREE.Color(COLORS.center) },
        uOpacity: { value: 0 }
      },
      vertexShader: BODY_VERTEX_SHADER,
      fragmentShader: BODY_FRAGMENT_SHADER,
      transparent: true,
      premultipliedAlpha: true, // シェーダーが色に不透明度を掛けた値を出すため
      depthWrite: false,
      depthTest: false
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(BASE_RADIUS, 64, 48), this.sphereMaterial);
    sphere.renderOrder = RENDER_ORDER.body;
    this.object.add(sphere);

    this.coreGlowMaterial = new THREE.SpriteMaterial({
      map: makeCoreGlowTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    this.#addSprite(this.coreGlowMaterial, CORE_GLOW_SCALE, RENDER_ORDER.coreGlow);
  }

  /**
   * @param presence 0..1。出現の度合い
   * @param pulse 0..1。出現の瞬間の膨らみ
   */
  update(presence: number, pulse: number): void {
    this.haloMaterial.opacity = presence * (1 + pulse * HALO_PULSE_BOOST);
    this.sphereMaterial.uniforms.uOpacity.value = BODY_OPACITY * presence;
    this.coreGlowMaterial.opacity = CORE_GLOW_OPACITY * presence;
  }

  /** 球と同じ中心に、球の直径の scale 倍のビルボードを置く。 */
  #addSprite(material: THREE.SpriteMaterial, scale: number, renderOrder: number): void {
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(BASE_RADIUS * 2 * scale);
    sprite.renderOrder = renderOrder;
    this.object.add(sprite);
  }
}
