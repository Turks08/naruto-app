import * as THREE from 'three';
import type { Point2D } from '../types.js';
import { ChakraThreads } from './rasengan/ChakraThreads.js';
import { BASE_RADIUS } from './rasengan/constants.js';
import { RasenganBody } from './rasengan/RasenganBody.js';
import { WindArcs } from './rasengan/WindArcs.js';

/** 画面の短辺に対する螺旋丸の半径の比率。大きいほど迫力が出る。 */
const RADIUS_TO_SCREEN_RATIO = 0.28;

/** 遠近カメラの縦の画角(度)。小さいほど遠近感が弱く、正投影に近づく。 */
const CAMERA_FOV = 30;

/** 1フレームの経過時間の上限(秒)。タブ復帰時などに動きが飛ばないようにする。 */
const MAX_FRAME_SECONDS = 0.05;
/** 出現・消失の速さ(大きいほど速い)。出現は素早く、消失はやや緩やかに。 */
const APPEAR_SPEED = 7;
const DISAPPEAR_SPEED = 4;
/** この出現度合いを下回ったら描画しない。 */
const VISIBLE_THRESHOLD = 0.003;
/** 手への追従の速さ(大きいほど速い)。小さくすると手ブレを吸収するが遅れて付いてくる。 */
const FOLLOW_SPEED = 14;
/** 出現の瞬間の膨らみ: 膨らむ量と、1秒あたりの減衰量。 */
const PULSE_SCALE_BOOST = 0.3;
const PULSE_DECAY_PER_SECOND = 3;
/** 呼吸するようにわずかに伸縮させる: 速さと振れ幅。 */
const BREATHING_SPEED = 3.2;
const BREATHING_AMOUNT = 0.03;

/** 目標値へ指数的に近づけるときの、1フレームでの近づく割合。 */
function approachRate(speed: number, dt: number): number {
  return 1 - Math.exp(-speed * dt);
}

// 手のひらを掲げている間、手元に追従して出現し続ける螺旋丸。
// 掲げ始めると膨らみながら出現し、手を下ろす/閉じるとしぼんで消える。
//
// レイヤー構成(奥から順に描く。順番は rasengan/constants.ts の RENDER_ORDER):
// - 球本体(rasengan/RasenganBody.ts): 縁がにじむ青い半透明の球と、中心の白い光
// - チャクラの線(rasengan/ChakraThreads.ts): 球の中で毛糸玉のように絡み合い、1本ずつ別方向に回る細い線
// - 風の弧(rasengan/WindArcs.ts): 球の外側を大きく回る薄い弧
//
// カメラは遠近(Perspective)を使い、z=0 の平面上ではフレームのピクセル座標系(0..width, 0..height)が
// そのままワールド座標のXYに対応するように置いている。手のひらの2D座標にそのまま重ねつつ、
// 線や風の弧が球の手前・奥を通るときに遠近が付く。
//
// キャンバスは透過で描き、球本体は通常の半透明合成でカメラ映像を青く覆う。
// 加算合成や screen 合成は背景より明るくすることしかできず、白い壁や肌の上では白く飛んで青にならないため。
export class RasenganEffect {
  private readonly flashEl: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 10000);
  private readonly clock = new THREE.Clock();

  /** 螺旋丸の全レイヤーをまとめたグループ。位置と大きさはこのグループで動かす。 */
  private readonly group = new THREE.Group();
  private readonly body = new RasenganBody();
  private readonly threads = new ChakraThreads();
  private readonly windArcs = new WindArcs();

  private width = 0;
  private height = 0;
  /** 画面サイズから決まる、BASE_RADIUS に対する拡大率。 */
  private viewScale = 1;

  /** 経過秒数(各レイヤーのアニメーションに使う)。 */
  private age = 0;
  /** 0..1。出現の度合い(0で非表示、1で完全に出現)。 */
  private presence = 0;
  private targetPresence = 0;
  /** 出現した瞬間に1になり、減衰していく「ドンッ」という膨らみの演出用。 */
  private pulse = 0;

  /** 今の位置と、追従先(手のひらの位置)。どちらも画面のピクセル座標。 */
  private position: Point2D = { x: 0, y: 0 };
  private target: Point2D = { x: 0, y: 0 };

  /**
   * @param canvas 螺旋丸を描く WebGL 用キャンバス
   * @param flashEl 出現の瞬間に光らせる要素(CSS アニメーション .flash-anim を付け外しする)
   */
  constructor(canvas: HTMLCanvasElement, flashEl: HTMLElement) {
    this.flashEl = flashEl;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    // 細い線をくっきり描くため、Retina では2倍まで解像度を上げる
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0); // 背景は透明(映像を透かす)

    this.group.add(this.body.object, this.threads.object, this.windArcs.object);
    this.group.visible = false;
    this.scene.add(this.group);

    // 実サイズは main.ts 側の resizeCanvases() で直後に確定するので、ここは暫定値でよい
    this.resize(window.innerWidth, window.innerHeight);
  }

  /** キャンバスサイズ変更時に呼ぶ。three.js のレンダラーとカメラを追従させる。 */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false); // false: CSSサイズはスタイルシート側に任せる

    // 画面中央の奥(-z側)から +z 方向を見て、up を -y にすることで、
    // z=0 平面上の画面ピクセル座標(x右向き・y下向き)とワールド座標を一致させる。
    // 距離は「画角の上下端が z=0 平面で 0 と height に来る」ように決める。
    const distance = (height / 2) / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    this.camera.aspect = width / height;
    this.camera.position.set(width / 2, height / 2, -distance);
    this.camera.up.set(0, -1, 0);
    this.camera.lookAt(width / 2, height / 2, 0);
    this.camera.near = distance * 0.1;
    this.camera.far = distance * 3;
    this.camera.updateProjectionMatrix();

    const radiusPx = Math.min(width, height) * RADIUS_TO_SCREEN_RATIO;
    this.viewScale = radiusPx / BASE_RADIUS;
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

    // カメラ映像は鏡表示なので、x座標を反転して手のひらの中心に重ねる
    this.target = { x: this.width - origin.x * this.width, y: origin.y * this.height };

    const isAppearing = this.targetPresence === 0;
    if (isAppearing) {
      // 前回の位置から滑ってこないよう手元に即座に置き、ドンッと膨らませてフラッシュさせる
      this.position = { ...this.target };
      this.pulse = 1;
      this.#flash();
    }
    this.targetPresence = 1;
  }

  render(): void {
    const dt = Math.min(this.clock.getDelta(), MAX_FRAME_SECONDS);
    this.age += dt;
    this.#updatePresence(dt);

    const visible = this.presence > VISIBLE_THRESHOLD;
    this.group.visible = visible;
    if (visible) {
      this.#followTarget(dt);
      this.#updateScale();
      this.body.update(this.presence, this.pulse);
      this.threads.update(this.age, this.presence);
      this.windArcs.update(dt, this.age, this.presence);
    }

    this.renderer.render(this.scene, this.camera);
  }

  #updatePresence(dt: number): void {
    const speed = this.targetPresence > this.presence ? APPEAR_SPEED : DISAPPEAR_SPEED;
    this.presence += (this.targetPresence - this.presence) * approachRate(speed, dt);
    this.pulse = Math.max(0, this.pulse - dt * PULSE_DECAY_PER_SECOND);
  }

  /** 手ブレを吸収しつつ、手元に追従させる。 */
  #followTarget(dt: number): void {
    const rate = approachRate(FOLLOW_SPEED, dt);
    this.position.x += (this.target.x - this.position.x) * rate;
    this.position.y += (this.target.y - this.position.y) * rate;
    this.group.position.set(this.position.x, this.position.y, 0);
  }

  /** 画面サイズ・出現の度合い・出現時の膨らみ・呼吸の伸縮を掛け合わせて大きさを決める。 */
  #updateScale(): void {
    const pulseScale = 1 + this.pulse * PULSE_SCALE_BOOST;
    const breathing = 1 + Math.sin(this.age * BREATHING_SPEED) * BREATHING_AMOUNT;
    this.group.scale.setScalar(this.viewScale * this.presence * pulseScale * breathing);
  }

  #flash(): void {
    this.flashEl.classList.remove('flash-anim');
    void this.flashEl.offsetWidth; // reflow を挟んで、同じアニメーションを再生し直す
    this.flashEl.classList.add('flash-anim');
  }
}
