import type { Landmark, Point2D } from '../types.js';

// MediaPipe の手のランドマーク番号
const WRIST = 0;
const MIDDLE_MCP = 9; // 中指の付け根
const FINGER_TIPS = [8, 12, 16, 20] as const; // 人差し指〜小指の先端
const FINGER_MCPS = [5, 9, 13, 17] as const; // 対応する付け根

/** 指先が付け根よりこの倍率以上に手首から離れていれば「伸びている」とみなす。 */
const EXTENDED_RATIO = 1.15;
/** 人差し指〜小指の4本のうち、この本数以上が伸びていれば「開いた手」とみなす。 */
const MIN_EXTENDED_FINGERS = 3;

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 値オブジェクト: 検出された1つの手。ランドマークは正規化座標(0..1)。
export class Hand {
  readonly landmarks: Landmark[];

  constructor(landmarks: Landmark[]) {
    this.landmarks = landmarks;
  }

  /** 手のひらの中心(中指の付け根)。螺旋丸を出す位置に使う。 */
  get palmCenter(): Point2D {
    return this.landmarks[MIDDLE_MCP];
  }

  /** 指が伸びているか(開いた手か)を簡易判定する。 */
  get isOpenPalm(): boolean {
    const wrist = this.landmarks[WRIST];
    const extendedCount = FINGER_TIPS.filter((tip, i) => {
      const tipDistance = distance(this.landmarks[tip], wrist);
      const baseDistance = distance(this.landmarks[FINGER_MCPS[i]], wrist);
      return tipDistance > baseDistance * EXTENDED_RATIO;
    }).length;
    return extendedCount >= MIN_EXTENDED_FINGERS;
  }
}
