export interface PalmHoldObservation {
  /** 手のひらを掲げ続けている(顕現中)か。 */
  summoning: boolean;
  /** 0..1。掲げ始め/下ろし始めの移行をなめらかにするための度合い。 */
  progress: number;
}

// 1フレームだけの検出ブレで顕現/消失が点滅しないよう、
// 連続フレーム数で状態を確定させる(チャタリング防止のデバウンス)。
const HOLD_FRAMES = 5;

// ドメインサービス: 「手のひらを開いて掲げている」状態が続いているかを検知する。
export class PalmHoldDetector {
  private openStreak = 0;
  private closedStreak = 0;
  private summoning = false;

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

  reset(): void {
    this.openStreak = 0;
    this.closedStreak = 0;
    this.summoning = false;
  }
}
