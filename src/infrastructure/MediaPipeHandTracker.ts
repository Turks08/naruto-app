import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Landmark } from '../types.js';

// wasm本体とモデルはサイズが大きく npm バンドルに含めないため、CDNから読み込む。
// npm の @mediapipe/tasks-vision はバージョンを固定し、wasm側のバージョンとズレないようにする。
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// アダプタ: MediaPipe の HandLandmarker を隠蔽し、ランドマーク配列だけを返す。
export class MediaPipeHandTracker {
  private landmarker: HandLandmarker | null = null;

  async load(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1
    });
  }

  /** @returns 手が無ければ null */
  detect(videoEl: HTMLVideoElement, nowMs: number): Landmark[] | null {
    if (!this.landmarker) return null;
    const result = this.landmarker.detectForVideo(videoEl, nowMs);
    return result.landmarks && result.landmarks.length > 0
      ? (result.landmarks[0] as Landmark[])
      : null;
  }
}
