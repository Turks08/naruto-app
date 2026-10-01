/**
 * 1フレームだけの検出ブレで出現/消失が点滅しないよう、同じ状態がこのフレーム数続いてから切り替える
 * (チャタリング防止のデバウンス)。
 */
const HOLD_FRAMES = 5;

export interface PalmHoldObservation {
  /** 手のひらを掲げ続けている(螺旋丸を出している)か。 */
  summoning: boolean;
  /** 0..1。掲げ始め/下ろし始めから、状態が切り替わるまでの進み具合。 */
  progress: number;
}

// ドメインサービス: 「手のひらを開いて掲げている」状態が続いているかを検知する。
export class PalmHoldDetector {
  private openStreak = 0;
  private closedStreak = 0;
  private summoning = false;

  /** 毎フレーム、そのフレームで手が開いていたかを渡す。 */
  observe(isOpenPalm: boolean): PalmHoldObservation {
    if (isOpenPalm) {
      this.openStreak++;
      this.closedStreak = 0;
    } else {
      this.closedStreak++;
      this.openStreak = 0;
    }

    if (!this.summoning && this.openStreak >= HOLD_FRAMES) this.summoning = true;
    if (this.summoning && this.closedStreak >= HOLD_FRAMES) this.summoning = false;

    const progress = this.summoning
      ? Math.max(1 - this.closedStreak / HOLD_FRAMES, 0)
      : Math.min(this.openStreak / HOLD_FRAMES, 1);

    return { summoning: this.summoning, progress };
  }
}
