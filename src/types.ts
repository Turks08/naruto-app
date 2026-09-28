// アプリ全体で共有する基本的な型定義。

/** 2次元の正規化座標、またはピクセル座標を表す点。 */
export interface Point2D {
  x: number;
  y: number;
}

/** MediaPipe HandLandmarker が返す1点のランドマーク(正規化座標 0..1)。 */
export interface Landmark extends Point2D {
  z: number;
}
