import { Hand } from '../domain/Hand.js';
import type { PalmHoldDetector } from '../domain/PalmHoldDetector.js';
import type { Landmark, Point2D } from '../types.js';

export interface SummonMagicResult {
  handFound: boolean;
  isOpenPalm?: boolean;
  /** 0..1。手のひらを掲げ始めてから顕現が確定するまでの度合い。 */
  progress: number;
  /** 顕現中(手のひらを掲げている間)は true。 */
  summoning: boolean;
  /** 顕現中の手のひら位置(正規化座標)。顕現していなければ null。 */
  origin: Point2D | null;
}

export interface SummonMagicDeps {
  palmHoldDetector: PalmHoldDetector;
}

// ユースケース: 1フレーム分のランドマークから、マグマ玉を顕現させるか判断する。
// 描画やデバイスには依存せず、結果を素のオブジェクトで返す。
export class SummonMagicUseCase {
  private readonly palmHoldDetector: PalmHoldDetector;

  constructor({ palmHoldDetector }: SummonMagicDeps) {
    this.palmHoldDetector = palmHoldDetector;
  }

  execute(landmarks: Landmark[] | null): SummonMagicResult {
    if (!landmarks) {
      // 手が見えない間は「閉じた手」として扱い、しばらくして消失させる
      const { summoning, progress } = this.palmHoldDetector.observe(false);
      return { handFound: false, progress, summoning, origin: null };
    }

    const hand = new Hand(landmarks);
    const { summoning, progress } = this.palmHoldDetector.observe(hand.isOpenPalm);
    const origin = summoning ? { x: hand.palmCenter.x, y: hand.palmCenter.y } : null;

    return { handFound: true, isOpenPalm: hand.isOpenPalm, progress, summoning, origin };
  }
}
