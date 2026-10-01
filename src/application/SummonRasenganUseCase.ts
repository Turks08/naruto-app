import { Hand } from '../domain/Hand.js';
import type { PalmHoldDetector } from '../domain/PalmHoldDetector.js';
import type { Landmark, Point2D } from '../types.js';

export interface SummonRasenganResult {
  handFound: boolean;
  /** 手が見つかったときだけ入る。 */
  isOpenPalm?: boolean;
  /** 0..1。手のひらを掲げ始めてから、螺旋丸の出現が確定するまでの進み具合。 */
  progress: number;
  /** 螺旋丸を出している間(手のひらを掲げている間)は true。 */
  summoning: boolean;
  /** 螺旋丸を出す位置(手のひらの中心。正規化座標)。出していなければ null。 */
  origin: Point2D | null;
}

export interface SummonRasenganDeps {
  palmHoldDetector: PalmHoldDetector;
}

// ユースケース: 1フレーム分のランドマークから、螺旋丸を出すかどうかを判断する。
// 描画やデバイスには依存せず、結果を素のオブジェクトで返す。
export class SummonRasenganUseCase {
  private readonly palmHoldDetector: PalmHoldDetector;

  constructor({ palmHoldDetector }: SummonRasenganDeps) {
    this.palmHoldDetector = palmHoldDetector;
  }

  execute(landmarks: Landmark[] | null): SummonRasenganResult {
    if (!landmarks) {
      // 手が見えない間は「閉じた手」として扱い、しばらくして消す
      const { summoning, progress } = this.palmHoldDetector.observe(false);
      return { handFound: false, progress, summoning, origin: null };
    }

    const hand = new Hand(landmarks);
    const { summoning, progress } = this.palmHoldDetector.observe(hand.isOpenPalm);
    const origin = summoning ? { x: hand.palmCenter.x, y: hand.palmCenter.y } : null;

    return { handFound: true, isOpenPalm: hand.isOpenPalm, progress, summoning, origin };
  }
}
