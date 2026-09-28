// ステータス文言と発動ゲージのDOM更新。
export class Hud {
  private readonly statusEl: HTMLElement;
  private readonly barEl: HTMLElement;

  constructor(statusEl: HTMLElement, barEl: HTMLElement) {
    this.statusEl = statusEl;
    this.barEl = barEl;
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  /** @param progress 0..1 */
  setProgress(progress: number): void {
    this.barEl.style.width = progress * 100 + '%';
  }

  showHand(isOpenPalm: boolean, progress: number): void {
    this.setStatus(isOpenPalm ? '手のひら検出中(開)' : '手のひら検出中(閉)');
    this.setProgress(progress);
  }

  showNoHand(): void {
    this.setStatus('手が見つかりません');
    this.setProgress(0);
  }
}
