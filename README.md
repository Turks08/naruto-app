# motion-app

ドラクエソード風 魔法ジェスチャー プロトタイプ。カメラに向かって手のひらを開いて掲げると、手元にマグマ玉が顕現する。

## 遊び方

1. `npm run dev` で起動し、ブラウザで開く
2. 「カメラを起動して開始」を押し、カメラ利用を許可する
3. 手のひらを開いてカメラに向かって掲げると、手の少し上にマグマ玉が出現する
4. 手を閉じる、または下ろすと消える

HTTPS が必須の Camera API だが、`localhost` は例外的に許可されるためそのまま動作する。

## セットアップ

```bash
npm install
npm run dev       # 開発サーバー起動(HMR付き)
npm run build     # 型チェック + 本番ビルド(dist/ に出力)
npm run preview   # ビルド済み dist/ をローカルで確認
npm run typecheck # 型チェックのみ
```

## 技術スタック

- TypeScript + Vite(ビルドツール)
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)(`@mediapipe/tasks-vision`)による手のランドマーク検出
  - JS APIは npm パッケージから、wasm本体とモデルファイルはサイズが大きいため CDN / Google Cloud Storage から読み込む
- [three.js](https://threejs.org/) による3D描画(マグマ玉のエフェクト)
- フレームワークなしの素の DOM 操作(UI部分)

## ディレクトリ構成

レイヤードアーキテクチャ(DDD風)を採用している。

```
index.html                # エントリーHTML
src/
├── main.ts                          # コンポジションルート。各層を組み立ててフレームループを回す
├── types.ts                         # 共有する基本型(Point2D, Landmark)
├── domain/                          # ドメイン層(純粋ロジック、外部依存なし)
│   ├── Hand.ts                      # 検出された手の値オブジェクト(開いた手か等を判定)
│   └── PalmHoldDetector.ts          # 「手のひらを掲げ続けている」状態を検知するドメインサービス
├── application/
│   └── SummonMagicUseCase.ts        # ユースケース: 1フレーム分のランドマークからマグマ玉を出すか判断する
├── infrastructure/                  # 外部技術への依存を隔離するアダプタ
│   ├── Camera.ts                    # getUserMedia のラッパー
│   └── MediaPipeHandTracker.ts      # MediaPipe HandLandmarker のアダプタ
└── presentation/                    # 描画・UI
    ├── HandOverlayRenderer.ts       # 手の骨格をCanvas 2Dに描画
    ├── Hud.ts                       # ステータス文言と発動ゲージのDOM更新
    └── MagmaOrbEffect.ts            # マグマ玉の3Dエフェクト本体(Three.js)
styles/main.css                      # 全体のスタイル
```

各層の依存方向は `presentation → application → domain`、`infrastructure` は `domain`/`application` から抽象として扱われる。`domain`/`application` 層はカメラやMediaPipe、three.jsに一切依存しない。

## マグマ玉エフェクトについて

[ics-creative/160907_magma_effect](https://github.com/ics-creative/160907_magma_effect) の「マグマ球」のレイヤー構造を参考に、手のひらに追従して顕現する常駐オブジェクトとして移植したもの。

- **コア**: 手続き生成した模様テクスチャをUVスクロールさせ、マグマの流動感を出す
- **オーラ**: コアとは逆方向にスクロールする半透明レイヤー(加算合成)
- **リムライト**: 視線に対して縁だけ光るフレネル風の発光(標準GLSLの `ShaderMaterial` で実装。参照実装はWebGPU/TSLシェーダーだったため同等の見た目を再現した)
- **外周グロー**: 背後に大きく広がる加算合成のスプライト
- **火の粉**: 常時発生するアンビエントパーティクル

テクスチャは全て `<canvas>` で手続き的に生成しており、外部アセット(画像ファイル)には一切依存していない。

カメラは正投影(`OrthographicCamera`)を採用し、フレームのピクセル座標系をそのままワールド座標のXYに対応させることで、手のひらの2D座標にそのまま重ねられるようにしている。

## 補足

- `magic_gesture_prototype.html` は `src/` と独立したスタンドアロンの初期プロトタイプ(インラインスタイル・スクリプト持ち)で、現在の実装とは無関係。
