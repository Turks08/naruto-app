// アダプタ: ブラウザのカメラ(getUserMedia)を <video> に接続する。
export class Camera {
  private readonly videoEl: HTMLVideoElement;

  constructor(videoEl: HTMLVideoElement) {
    this.videoEl = videoEl;
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 }, audio: false
    });
    this.videoEl.srcObject = stream;
    await new Promise<void>(resolve => {
      this.videoEl.onloadedmetadata = () => resolve();
    });
    this.videoEl.play();
  }
}
