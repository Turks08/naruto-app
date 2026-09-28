// コンポジションルート: 各層を組み立て、フレームループを回す。
import { PalmHoldDetector } from './domain/PalmHoldDetector.js';
import { SummonMagicUseCase } from './application/SummonMagicUseCase.js';
import { Camera } from './infrastructure/Camera.js';
import { MediaPipeHandTracker } from './infrastructure/MediaPipeHandTracker.js';
import { HandOverlayRenderer } from './presentation/HandOverlayRenderer.js';
import { MagmaOrbEffect } from './presentation/MagmaOrbEffect.js';
import { Hud } from './presentation/Hud.js';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素が見つかりません: #${id}`);
  return el as T;
}

const video = byId<HTMLVideoElement>('video');
const overlayCanvas = byId<HTMLCanvasElement>('overlay');
const fxCanvas = byId<HTMLCanvasElement>('fx');
const startBtn = byId<HTMLButtonElement>('start-btn');

const hud = new Hud(byId('status'), byId('bar'));
const overlay = new HandOverlayRenderer(overlayCanvas);
const camera = new Camera(video);
const tracker = new MediaPipeHandTracker();
const summonMagic = new SummonMagicUseCase({ palmHoldDetector: new PalmHoldDetector() });

// MagmaOrbEffect は光球画像の読み込みを待つ非同期ファクトリのため、準備できるまでボタンを無効化しておく
let effect: MagmaOrbEffect | null = null;
function getEffect(): MagmaOrbEffect {
  if (!effect) throw new Error('エフェクトの初期化が完了していません');
  return effect;
}

function resizeCanvases(): void {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  // fx キャンバスは Three.js の WebGLRenderer が管理しているため、専用の resize() 経由で反映する
  effect?.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resizeCanvases);

function loop(): void {
  const landmarks = tracker.detect(video, performance.now());
  const result = summonMagic.execute(landmarks);

  overlay.clear();
  if (landmarks && result.handFound) {
    overlay.draw(landmarks);
    hud.showHand(!!result.isOpenPalm, result.progress);
  } else {
    hud.showNoHand();
  }

  const e = getEffect();
  e.setTarget(result.origin);
  e.render();
  requestAnimationFrame(loop);
}

async function start(): Promise<void> {
  hud.setStatus('モデル読み込み中...');
  await tracker.load();
  await camera.start();
  hud.setStatus('手を映してください');
  requestAnimationFrame(loop);
}

startBtn.disabled = true;
startBtn.addEventListener('click', async () => {
  startBtn.style.display = 'none';
  try {
    await start();
  } catch (e) {
    hud.setStatus('エラー: ' + (e instanceof Error ? e.message : String(e)));
    console.error(e);
  }
});

hud.setStatus('画像読み込み中...');
MagmaOrbEffect.create(fxCanvas, byId('cast-flash'))
  .then(created => {
    effect = created;
    resizeCanvases();
    startBtn.disabled = false;
    hud.setStatus('準備完了');
  })
  .catch(e => {
    hud.setStatus('初期化エラー: ' + (e instanceof Error ? e.message : String(e)));
    console.error(e);
  });
