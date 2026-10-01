/** ジオメトリ上の基準半径。実際の画面上の大きさは RasenganEffect の viewScale(画面サイズ比)で決まる。 */
export const BASE_RADIUS = 40;

/**
 * 描画順(小さいほど先=奥に描く)。各レイヤーは深度テストを使わず、この順番だけで前後を決める。
 */
export const RENDER_ORDER = {
  halo: 0,
  body: 1,
  coreGlow: 2,
  threads: 3,
  windArcs: 4
} as const;
