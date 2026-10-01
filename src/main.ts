// コンポジションルート: 各層を組み立て、フレームループを回す。
import { SummonRasenganUseCase } from './application/SummonRasenganUseCase.js';
import { PalmHoldDetector } from './domain/PalmHoldDetector.js';
import { Camera } from './infrastructure/Camera.js';
import { MediaPipeHandTracker } from './infrastructure/MediaPipeHandTracker.js';
import { HandOverlayRenderer } from './presentation/HandOverlayRenderer.js';
import { Hud } from './presentation/Hud.js';
import { RasenganEffect } from './presentation/RasenganEffect.js';
import type { Point2D } from './types.js';

// ?preview を付けて開くと、カメラと手の検出を使わずに画面中央へ螺旋丸を出し続ける(見た目の調整・確認用)。
// &bg=light を付けると背景を明るくし、白い壁や肌の上での見え方を確認できる。
const params = new URLSearchParams(location.search);
const IS_PREVIEW = params.has('preview');
const PREVIEW_ORIGIN: Point2D = { x: 0.5, y: 0.5 };
const PREVIEW_LIGHT_BACKGROUND = '#e8e2d8';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素が見つかりません: #${id}`);
  return el as T;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const video = byId<HTMLVideoElement>('video');
const overlayCanvas = byId<HTMLCanvasElement>('overlay');
const startBtn = byId<HTMLButtonElement>('start-btn');

const hud = new Hud(byId('status'), byId('bar'));
const overlay = new HandOverlayRenderer(overlayCanvas);
const camera = new Camera(video);
const tracker = new MediaPipeHandTracker();
const summonRasengan = new SummonRasenganUseCase({ palmHoldDetector: new PalmHoldDetector() });

let effect: RasenganEffect;
try {
  effect = new RasenganEffect(byId('fx'), byId('appear-flash'));
} catch (e) {
  // WebGL が使えない環境など。以降の処理は続けられないので、表示だけして止める
  hud.setStatus('初期化エラー: ' + errorMessage(e));
  throw e;
}

function resizeCanvases(): void {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  // fx キャンバスは three.js の WebGLRenderer が管理しているため、専用の resize() 経由で反映する
  effect.resize(window.innerWidth, window.innerHeight);
}

function renderRasengan(origin: Point2D | null): void {
  effect.setTarget(origin);
  effect.render();
}

function cameraLoop(): void {
  const landmarks = tracker.detect(video, performance.now());
  const result = summonRasengan.execute(landmarks);

  overlay.clear();
  if (landmarks) {
    overlay.draw(landmarks);
    hud.showHand(!!result.isOpenPalm, result.progress);
  } else {
    hud.showNoHand();
  }

  renderRasengan(result.origin);
  requestAnimationFrame(cameraLoop);
}

function previewLoop(): void {
  renderRasengan(PREVIEW_ORIGIN);
  requestAnimationFrame(previewLoop);
}

async function startCamera(): Promise<void> {
  hud.setStatus('モデル読み込み中...');
  await tracker.load();
  await camera.start();
  hud.setStatus('手を映してください');
  requestAnimationFrame(cameraLoop);
}

function startPreview(): void {
  startBtn.style.display = 'none';
  if (params.get('bg') === 'light') document.body.style.background = PREVIEW_LIGHT_BACKGROUND;
  hud.setStatus('プレビュー(カメラなし)');
  requestAnimationFrame(previewLoop);
}

window.addEventListener('resize', resizeCanvases);
resizeCanvases();

if (IS_PREVIEW) {
  startPreview();
} else {
  startBtn.addEventListener('click', async () => {
    startBtn.style.display = 'none';
    try {
      await startCamera();
    } catch (e) {
      hud.setStatus('エラー: ' + errorMessage(e));
      console.error(e);
    }
  });
  hud.setStatus('準備完了');
}
