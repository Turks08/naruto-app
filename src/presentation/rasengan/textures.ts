import * as THREE from 'three';
import { randomRange } from './random.js';

/** グラデーションの1色分。offset は中心(0)〜外周(1)の位置。 */
interface ColorStop {
  offset: number;
  color: string;
}

function create2dCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context を取得できませんでした');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 正方形の放射グラデーションのテクスチャを作る。 */
function makeRadialGradientTexture(size: number, stops: ColorStop[]): THREE.CanvasTexture {
  const [canvas, ctx] = create2dCanvas(size, size);
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  stops.forEach(({ offset, color }) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

/**
 * 風の弧用の、横方向にタイルできる白い筋のテクスチャ。
 * 各筋を左右に1幅ずつずらしても描くことで、横方向の継ぎ目が目立たないようにしている。
 */
export function makeWindStreakTexture(): THREE.CanvasTexture {
  const width = 256;
  const height = 64;
  const streakCount = 50;
  const [canvas, ctx] = create2dCanvas(width, height);

  for (let i = 0; i < streakCount; i++) {
    const x = randomRange(0, width);
    const y = randomRange(0, height);
    const length = randomRange(10, 56);
    const slope = randomRange(-4, 4);
    ctx.strokeStyle = `rgba(255,255,255,${randomRange(0.25, 0.75)})`;
    ctx.lineWidth = randomRange(1, 3);
    [-width, 0, width].forEach(shift => {
      ctx.beginPath();
      ctx.moveTo(x + shift, y);
      ctx.lineTo(x + shift + length, y + slope);
      ctx.stroke();
    });
  }

  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** 球の中心に重ねる、白く柔らかい光の玉のテクスチャ。 */
export function makeCoreGlowTexture(): THREE.CanvasTexture {
  return makeRadialGradientTexture(128, [
    { offset: 0, color: 'rgba(255,255,255,1)' },
    { offset: 0.25, color: 'rgba(255,255,255,0.7)' },
    { offset: 0.6, color: 'rgba(200,240,255,0.2)' },
    { offset: 1, color: 'rgba(200,240,255,0)' }
  ]);
}

/**
 * 球の縁の外側をにじませる、青いハローのテクスチャ。
 * 中心付近は球本体に隠れるので、球の輪郭(テクスチャの半径の約69%。RasenganBody の HALO_SCALE で決まる)
 * 付近を最も濃くし、外側へ向けて透明にする。
 */
export function makeHaloTexture(): THREE.CanvasTexture {
  return makeRadialGradientTexture(256, [
    { offset: 0, color: 'rgba(30,140,255,0)' },
    { offset: 0.55, color: 'rgba(30,140,255,0.35)' },
    { offset: 0.69, color: 'rgba(20,110,255,0.75)' },
    { offset: 0.82, color: 'rgba(20,110,255,0.25)' },
    { offset: 1, color: 'rgba(20,110,255,0)' }
  ]);
}
