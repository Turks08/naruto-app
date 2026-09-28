import * as THREE from 'three';
import type { Point2D } from '../types.js';
import orbImageUrl from './assets/orb.jpg';

// https://github.com/ics-creative/160907_magma_effect の「マグマ球」を構成する
// レイヤー構造(コア/オーラ/リムライト/外周グロー)を、手のひらに追従して顕現する常駐オブジェクトとして移植したもの。
// 参照実装のInGlow(縁が光るフレネル効果)はWebGPU/TSLシェーダーだったため、
// 標準の WebGLRenderer + GLSL ShaderMaterial で同等の見た目を再現している。
//
// コア/オーラ/外周グローには手続き生成のパターンではなく、実写の光球画像(orb.jpg)を使っている。
// 元画像はチェッカー柄の背景が焼き込まれた不透明JPEGなので、読み込み後に放射状グラデーションを
// 乗算してチェッカー部分を透明化してから使う(#loadOrbTexture)。

/** ジオメトリ上の基準半径。実際の画面上の大きさは viewScale(画面サイズ比)で決まる。 */
const BASE_RADIUS = 40;
/** 画面の短辺に対するマグマ玉の半径の比率。大きいほど迫力が出る。 */
const ORB_RADIUS_RATIO = 0.28;

const OUT_GLOW_SCALE = BASE_RADIUS * 6.5;

const EMBER_POOL_SIZE = 140;
const EMBER_SPAWN_PER_SEC = 70;

/** フレア(発光リング)の内側/外側半径(BASE_RADIUSに対する比率)と本数。 */
const FLARE_INNER_RATIO = 1.35;
const FLARE_OUTER_RATIO = 2.5;
const FLARE_COUNT = 6;

/**
 * 半径 innerRadius から outerRadius までの帯状のリング面を作る。
 * https://github.com/ics-creative/160907_magma_effect の Flare.ts のジオメトリ生成をそのまま移植したもの。
 */
function createFlareGeometry(innerRadius: number, outerRadius: number): THREE.BufferGeometry {
  const radialSegments = 40;
  const widthSegments = 3;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= widthSegments; y++) {
    const v = y / widthSegments;
    const radius = innerRadius + (outerRadius - innerRadius) * v;

    for (let x = 0; x <= radialSegments; x++) {
      const u = x / radialSegments;
      const theta = u * Math.PI * 2;
      positions.push(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
      uvs.push(u, v);
    }
  }

  for (let y = 0; y < widthSegments; y++) {
    for (let x = 0; x < radialSegments; x++) {
      const stride = radialSegments + 1;
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

const ORB_VERTEX_SHADER = `
  varying vec3 vViewNormal;
  void main() {
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// マットキャップ方式(視点空間の法線をそのままUVとして使う)で光球画像をサンプリングする。
// オブジェクト固有のUV(緯度経度式)を使わないため、球を自転させても継ぎ目や極のつぶれが発生せず、
// 常に法線が正面を向いている点=画像の中心付近(青い玉本体)だけが見える。
const ORB_FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform vec3 tint;
  uniform float opacity;
  varying vec3 vViewNormal;
  void main() {
    vec2 uv = vViewNormal.xy * 0.5 + 0.5;
    vec4 tex = texture2D(map, uv);
    gl_FragColor = vec4(tex.rgb * tint, tex.a * opacity);
  }
`;

const RIM_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// 法線と視線方向の内積が小さいほど(=縁に近いほど)強く光らせるフレネル風リムライト。
const RIM_FRAGMENT_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform vec3 glowColor;
  uniform float intensity;
  void main() {
    float rim = 1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
    float alpha = pow(rim, 2.2) * intensity;
    gl_FragColor = vec4(glowColor, alpha);
  }
`;

// 火の粉用のポイントスプライト。粒ごとにサイズ・透明度・色の混合率を持たせるためカスタムシェーダーにしている。
const EMBER_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aMix;
  uniform float pixelRatio;
  varying float vAlpha;
  varying float vMix;
  void main() {
    vAlpha = aAlpha;
    vMix = aMix;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * pixelRatio;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const EMBER_FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform vec3 colorA;
  uniform vec3 colorB;
  varying float vAlpha;
  varying float vMix;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    vec3 tint = mix(colorA, colorB, vMix);
    gl_FragColor = vec4(tint * tex.rgb, tex.a * vAlpha);
  }
`;

const FLARE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 参照実装(Flare.ts)のTSLノードをGLSLで再現したもの。
// uv().add(offset) でテクスチャをスクロールさせ(見た目上「回転」しているように見える)、
// v(帯の内側→外側)を sin でフェードさせて帯の両端が薄く・中央が最も強く光るようにする。
const FLARE_FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform vec2 offset;
  uniform vec3 tint;
  uniform float maxOpacity;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv + offset);
    float radialFade = clamp(sin(vUv.y * 3.14159265), 0.0, 1.0);
    float alpha = (tex.a + 0.3) * radialFade * maxOpacity;
    gl_FragColor = vec4(tex.rgb + tint, alpha);
  }
`;

interface FlareRing {
  material: THREE.ShaderMaterial;
  speedX: number;
  speedY: number;
}

interface EmberState {
  life: number; // 0..1(0で消滅)
  maxLife: number; // 秒
  vx: number;
  vy: number;
  vz: number;
  baseSize: number;
}

// 手のひらを掲げている間、手元に追従して顕現し続けるマグマ玉。
// 掲げ始めると膨らみながら出現し、手を下ろす/閉じるとしぼんで消える。
//
// カメラは正投影(Orthographic)を使い、フレームのピクセル座標系(0..width, 0..height)を
// そのままワールド座標のXYに対応させている。手のひらの2D座標にそのまま重ねられ、
// 球の回転・テクスチャの流動・リムライト・火の粉のZ方向の広がりで奥行き(3D感)を出している。
export class MagmaOrbEffect {
  private readonly flashEl: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly clock: THREE.Clock;

  private readonly group: THREE.Group;
  private readonly core: THREE.Mesh;
  private readonly coreMaterial: THREE.ShaderMaterial;
  private readonly aura: THREE.Mesh;
  private readonly auraMaterial: THREE.ShaderMaterial;
  private readonly rimMaterial: THREE.ShaderMaterial;
  private readonly outGlowMaterial: THREE.SpriteMaterial;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly flareRings: FlareRing[];

  private readonly emberGeometry: THREE.BufferGeometry;
  private readonly emberPositions: Float32Array;
  private readonly emberSizes: Float32Array;
  private readonly emberAlphas: Float32Array;
  private readonly emberMixes: Float32Array;
  private readonly emberStates: EmberState[];
  private emberSpawnCarry = 0;

  private width = 0;
  private height = 0;
  /** 画面サイズから決まる、BASE_RADIUS に対する拡大率。 */
  private viewScale = 1;

  private age = 0;
  /** 0..1。顕現の度合い(0で非表示、1で完全に出現)。 */
  private presence = 0;
  private targetPresence = 0;
  /** 出現した瞬間に1になり、減衰していく「ドンッ」という膨らみの演出用。 */
  private pulse = 0;

  private hasPosition = false;
  private posX = 0;
  private posY = 0;
  private targetX = 0;
  private targetY = 0;

  private constructor(canvas: HTMLCanvasElement, flashEl: HTMLElement, orbTexture: THREE.CanvasTexture) {
    this.flashEl = flashEl;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0); // 背景は透明(映像を透かす)

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 0, 0, 0, -2000, 2000);
    this.camera.position.z = 800;

    this.glowTexture = this.#makeGlowTexture();

    this.group = new THREE.Group();
    this.group.visible = false;

    // 実写の光球画像をコアの見た目に使う。マットキャップ方式なので、球を自転させても
    // 常に画像の中心(青い玉本体)だけが見え、写真の縁や市松模様の残りが映り込むことはない。
    this.coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: orbTexture },
        tint: { value: new THREE.Color(0xffffff) },
        opacity: { value: 1 }
      },
      vertexShader: ORB_VERTEX_SHADER,
      fragmentShader: ORB_FRAGMENT_SHADER,
      transparent: true
    });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(BASE_RADIUS, 40, 40), this.coreMaterial);
    this.group.add(this.core);

    // 同じ画像・同じ方式で、紫に色づけしつつ一回り大きく・加算合成で重ねてオーラ層にする(逆回転で厚みを出す)
    this.auraMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: orbTexture },
        tint: { value: new THREE.Color(0xb388ff) },
        opacity: { value: 0.9 }
      },
      vertexShader: ORB_VERTEX_SHADER,
      fragmentShader: ORB_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(BASE_RADIUS * 1.12, 40, 40), this.auraMaterial);
    this.group.add(this.aura);

    // 視線に対して縁が光るフレネル風リムグロー
    this.rimMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0xb388ff) },
        intensity: { value: 0.9 }
      },
      vertexShader: RIM_VERTEX_SHADER,
      fragmentShader: RIM_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide
    });
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(BASE_RADIUS * 1.05, 40, 40), this.rimMaterial));

    // 背後に大きく広がる加算合成のグローハロー(常にカメラ方向を向くビルボード)。
    // こちらも実写画像を使うことで、単純な放射グラデーションより情報量のある後光になる。
    this.outGlowMaterial = new THREE.SpriteMaterial({
      map: orbTexture,
      color: 0x9d6bff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.55
    });
    const outGlow = new THREE.Sprite(this.outGlowMaterial);
    outGlow.scale.setScalar(OUT_GLOW_SCALE);
    this.group.add(outGlow);

    // 球の周囲を横切る発光リング(参照実装のFlare/FlareEmitterを移植)。
    // 本数分のリングを異なる角度に傾けて配置し、それぞれ独立した速度でテクスチャをスクロールさせることで
    // 「同じ帯が単調に見えない」ようにする(参照実装のrandomRatioと同じ狙い)。
    const flareTexture = this.#makeFlareTexture();
    const flareGeometry = createFlareGeometry(BASE_RADIUS * FLARE_INNER_RATIO, BASE_RADIUS * FLARE_OUTER_RATIO);
    this.flareRings = [];
    for (let i = 0; i < FLARE_COUNT; i++) {
      const rad = (Math.PI * 2 * i) / FLARE_COUNT;
      const randomRatio = 0.7 + Math.random() * 0.6;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: flareTexture },
          offset: { value: new THREE.Vector2() },
          tint: { value: new THREE.Color(i % 2 === 0 ? 0x7fe3ff : 0xb388ff) },
          maxOpacity: { value: 0 }
        },
        vertexShader: FLARE_VERTEX_SHADER,
        fragmentShader: FLARE_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(flareGeometry, material);
      // 複数のリングを別方向へ傾け、球の周囲に放射状の帯を重ねる
      ring.rotation.x = rad;
      ring.rotation.y = rad * 1.3;
      ring.rotation.z = rad * 0.5;
      ring.renderOrder = 20;
      this.group.add(ring);
      this.flareRings.push({
        material,
        speedX: 0.15 * randomRatio,
        speedY: -0.35 * randomRatio
      });
    }

    // 火の粉(常時発生し、粒ごとに透明度が減衰する)
    this.emberPositions = new Float32Array(EMBER_POOL_SIZE * 3);
    this.emberSizes = new Float32Array(EMBER_POOL_SIZE);
    this.emberAlphas = new Float32Array(EMBER_POOL_SIZE);
    this.emberMixes = new Float32Array(EMBER_POOL_SIZE);
    this.emberStates = Array.from({ length: EMBER_POOL_SIZE }, () => ({
      life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, baseSize: 0
    }));
    this.emberGeometry = new THREE.BufferGeometry();
    this.emberGeometry.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    this.emberGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.emberSizes, 1));
    this.emberGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.emberAlphas, 1));
    this.emberGeometry.setAttribute('aMix', new THREE.BufferAttribute(this.emberMixes, 1));
    const emberMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.glowTexture },
        colorA: { value: new THREE.Color(0xc9a8ff) },
        colorB: { value: new THREE.Color(0x7fe3ff) },
        pixelRatio: { value: this.renderer.getPixelRatio() }
      },
      vertexShader: EMBER_VERTEX_SHADER,
      fragmentShader: EMBER_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const embers = new THREE.Points(this.emberGeometry, emberMaterial);
    embers.frustumCulled = false; // 位置を毎フレーム書き換えるためバウンディング計算に頼らない
    this.group.add(embers);

    this.scene.add(this.group);
    this.clock = new THREE.Clock();

    // 実サイズは main.ts 側の resizeCanvases() で直後に確定するので、ここは暫定値でよい
    this.resize(window.innerWidth, window.innerHeight);
  }

  /** 光球画像の読み込みを待ってからインスタンスを生成する非同期ファクトリ。 */
  static async create(canvas: HTMLCanvasElement, flashEl: HTMLElement): Promise<MagmaOrbEffect> {
    const orbTexture = await MagmaOrbEffect.#loadOrbTexture(orbImageUrl);
    return new MagmaOrbEffect(canvas, flashEl, orbTexture);
  }

  /**
   * 光球画像を読み込み、チェッカー柄の背景部分を放射状グラデーションで透過させる。
   * 元画像はJPEG(アルファチャンネル無し)で、透過部分がチェッカー柄として焼き込まれているため、
   * 中心が不透明・外周(チェッカー柄のある四隅)が透明になるようピクセル単位でアルファを乗算する。
   */
  static async #loadOrbTexture(url: string): Promise<THREE.CanvasTexture> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`光球画像の読み込みに失敗しました: ${url}`));
      el.src = url;
    });

    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context を取得できませんでした');
    ctx.drawImage(img, 0, 0, size, size);

    // 実ピクセルを全方位スキャンして計測したところ、最も内側の箇所(72°方向)では
    // 中心から半径の78%の位置でチェッカー柄(204,204,204 / 255,255,255の市松模様)が
    // 始まっていた。そのため OUTER はそれより確実に手前(74%)で完全透明になるよう絞り込む。
    const INNER_RATIO = 0.5;
    const OUTER_RATIO = 0.74;

    const imageData = ctx.getImageData(0, 0, size, size);
    const { data } = imageData;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxR;
        const t = Math.min(Math.max((d - INNER_RATIO) / (OUTER_RATIO - INNER_RATIO), 0), 1);
        const falloff = 1 - t * t * (3 - 2 * t); // smoothstepの反転(中心=1 → OUTER以遠=0)
        const idx = (y * size + x) * 4 + 3;
        data[idx] = Math.round(data[idx] * falloff);
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** キャンバスサイズ変更時に呼ぶ。Three.js のレンダラー/カメラを正しく追従させる。 */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false); // false: CSSサイズはスタイルシート側に任せる

    // top=0, bottom=height にすることで、画面ピクセル座標(y下向き)とワールド座標を一致させる
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();

    const orbRadiusPx = Math.min(width, height) * ORB_RADIUS_RATIO;
    this.viewScale = orbRadiusPx / BASE_RADIUS;
  }

  /**
   * 毎フレーム呼ぶ。手のひらを掲げている間は正規化座標(0..1、カメラ映像基準)を渡し、
   * 掲げていないときは null を渡す。
   */
  setTarget(origin: Point2D | null): void {
    if (!origin) {
      this.targetPresence = 0;
      return;
    }

    // 鏡表示に合わせてx座標を反転し、手のひら中心にそのまま重ねる
    const x = this.width - origin.x * this.width;
    const y = origin.y * this.height;
    this.targetX = x;
    this.targetY = y;

    if (this.targetPresence === 0) {
      // 出現の瞬間: 前回の位置から滑ってこないよう手元に即座に置き、ドンッと膨らませてフラッシュさせる
      this.posX = x;
      this.posY = y;
      this.hasPosition = true;
      this.pulse = 1;
      this.#flash();
    }
    this.targetPresence = 1;
  }

  render(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.age += dt;

    // 出現は素早く、消失はやや緩やかに
    const speed = this.targetPresence > this.presence ? 7 : 4;
    this.presence += (this.targetPresence - this.presence) * (1 - Math.exp(-speed * dt));
    this.pulse = Math.max(0, this.pulse - dt * 3);

    const visible = this.presence > 0.003;
    this.group.visible = visible;

    if (visible) {
      if (this.hasPosition) {
        // 手ブレを吸収しつつ、手元に追従させる
        const follow = 1 - Math.exp(-14 * dt);
        this.posX += (this.targetX - this.posX) * follow;
        this.posY += (this.targetY - this.posY) * follow;
      }
      this.group.position.set(this.posX, this.posY, 0);

      const breathing = 1 + Math.sin(this.age * 3.2) * 0.03;
      this.group.scale.setScalar(this.viewScale * this.presence * (1 + this.pulse * 0.3) * breathing);

      // コアとオーラを互い違いに自転させ、実写画像でも動きがあるように見せる
      this.core.rotation.y += dt * 0.9;
      this.core.rotation.x += dt * 0.5;
      this.aura.rotation.y -= dt * 0.7;

      this.coreMaterial.uniforms.opacity.value = this.presence;
      this.auraMaterial.uniforms.opacity.value = 0.9 * this.presence;
      this.rimMaterial.uniforms.intensity.value = 0.9 * this.presence;
      this.outGlowMaterial.opacity = 0.55 * this.presence * (1 + this.pulse * 0.6);

      // リングのテクスチャをスクロールさせ、回転しているように見せる
      this.flareRings.forEach(f => {
        f.material.uniforms.offset.value.set(this.age * f.speedX, this.age * f.speedY);
        f.material.uniforms.maxOpacity.value = 0.5 * this.presence;
      });
    }

    this.#updateEmbers(dt, visible);
    this.renderer.render(this.scene, this.camera);
  }

  #flash(): void {
    this.flashEl.classList.remove('flash-anim');
    void this.flashEl.offsetWidth; // reflow でアニメーション再トリガー
    this.flashEl.classList.add('flash-anim');
  }

  #updateEmbers(dt: number, visible: boolean): void {
    if (!visible) {
      // 非表示の間に古い火の粉が残っていて、再出現時に急に現れないよう一括で消す
      this.emberStates.forEach(s => { s.life = 0; });
      this.emberAlphas.fill(0);
      this.emberGeometry.attributes.aAlpha.needsUpdate = true;
      return;
    }

    if (this.targetPresence > 0.5) {
      this.emberSpawnCarry += dt * EMBER_SPAWN_PER_SEC;
      while (this.emberSpawnCarry >= 1) {
        this.emberSpawnCarry -= 1;
        this.#spawnEmber();
      }
    }

    for (let i = 0; i < EMBER_POOL_SIZE; i++) {
      const s = this.emberStates[i];
      if (s.life <= 0) {
        this.emberAlphas[i] = 0;
        continue;
      }
      s.life -= dt / s.maxLife;
      if (s.life <= 0) {
        s.life = 0;
        this.emberAlphas[i] = 0;
        continue;
      }
      const p = i * 3;
      this.emberPositions[p] += s.vx * dt;
      this.emberPositions[p + 1] += s.vy * dt;
      this.emberPositions[p + 2] += s.vz * dt;
      this.emberAlphas[i] = s.life;
      this.emberSizes[i] = s.baseSize * (0.4 + s.life * 0.6);
    }

    this.emberGeometry.attributes.position.needsUpdate = true;
    this.emberGeometry.attributes.aSize.needsUpdate = true;
    this.emberGeometry.attributes.aAlpha.needsUpdate = true;
    this.emberGeometry.attributes.aMix.needsUpdate = true;
  }

  #spawnEmber(): void {
    const idx = this.emberStates.findIndex(s => s.life <= 0);
    if (idx === -1) return;

    // 球の表面付近の、全方向(Z方向含む)のランダムな位置から発生させる
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.sin(phi) * Math.sin(theta);
    const dz = Math.cos(phi);
    const radius = BASE_RADIUS * (0.95 + Math.random() * 0.3);

    const s = this.emberStates[idx];
    s.life = 1;
    s.maxLife = 0.7 + Math.random() * 0.9;
    // 外向きの速度に加えて、上方向(画面座標ではYが負)へ立ち上らせる
    s.vx = dx * (15 + Math.random() * 25);
    s.vy = dy * (15 + Math.random() * 25) - (35 + Math.random() * 55);
    s.vz = dz * (15 + Math.random() * 25);
    s.baseSize = (9 + Math.random() * 17) * this.viewScale;

    const p = idx * 3;
    this.emberPositions[p] = dx * radius;
    this.emberPositions[p + 1] = dy * radius;
    this.emberPositions[p + 2] = dz * radius;
    this.emberMixes[idx] = Math.random();
    this.emberSizes[idx] = s.baseSize;
    this.emberAlphas[idx] = 1;
  }

  /**
   * フレアリング用の、横方向にタイル可能な発光ストライプテクスチャを手続き的に生成する。
   * orb.jpg は1枚絵で継ぎ目なくタイルできないため、リングにはこちらを使う。
   * 左右にずらして3回描画することで、横方向の継ぎ目が目立たないようにしている。
   */
  #makeFlareTexture(): THREE.CanvasTexture {
    const w = 256;
    const h = 64;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context を取得できませんでした');

    for (let i = 0; i < 50; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 10 + Math.random() * 46;
      const thickness = 1 + Math.random() * 2;
      const alpha = 0.25 + Math.random() * 0.5;
      const dy = (Math.random() - 0.5) * 8;
      [-w, 0, w].forEach(dx => {
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(x + dx, y);
        ctx.lineTo(x + dx + len, y + dy);
        ctx.stroke();
      });
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** 火の粉用のソフトな光の玉テクスチャを手続き的に生成する(小さく表示されるため画像は使わず軽量に済ませる)。 */
  #makeGlowTexture(): THREE.CanvasTexture {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D context を取得できませんでした');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(220,190,255,0.8)');
    g.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
}
