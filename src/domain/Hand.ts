import type { Landmark, Point2D } from '../types.js';

// 値オブジェクト: 検出された1つの手。ランドマークは正規化座標(0..1)。
const WRIST = 0;
const MIDDLE_MCP = 9;
const FINGER_TIPS = [8, 12, 16, 20] as const; // 人差し指〜小指の先端
const FINGER_MCPS = [5, 9, 13, 17] as const;  // 対応する付け根

const EXTENDED_RATIO = 1.15;
const MIN_EXTENDED_FINGERS = 4 * 0.75; // 4本中3本以上

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class Hand {
  readonly landmarks: Landmark[];

  constructor(landmarks: Landmark[]) {
    this.landmarks = landmarks;
  }

  /** 手の"大きさ"(手首〜中指付け根)。カメラに近づくほど大きくなる。 */
  get size(): number {
    return dist(this.landmarks[WRIST], this.landmarks[MIDDLE_MCP]);
  }

  /** 手のひらの中心(中指付け根)。魔法の発射位置に使う。 */
  get palmCenter(): Point2D {
    return this.landmarks[MIDDLE_MCP];
  }

  /** 指が伸びているか(開いた手か)を簡易判定する。 */
  get isOpenPalm(): boolean {
    const wrist = this.landmarks[WRIST];
    let extended = 0;
    for (let i = 0; i < FINGER_TIPS.length; i++) {
      const tip = dist(this.landmarks[FINGER_TIPS[i]], wrist);
      const base = dist(this.landmarks[FINGER_MCPS[i]], wrist);
      if (tip > base * EXTENDED_RATIO) extended++;
    }
    return extended >= MIN_EXTENDED_FINGERS;
  }
}
