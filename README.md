# naruto-app

手のひらをカメラに掲げると、手元に螺旋丸が出現するジェスチャー体験のプロトタイプ。
ブラウザ上で MediaPipe による手の検出と three.js による3D描画を行う。

## クイックスタート

```bash
npm install
npm run dev
```

1. 表示された URL をブラウザで開く
2. 「カメラを起動して開始」を押し、カメラの利用を許可する
3. 手のひらを開いてカメラに向けて掲げると、手の上に螺旋丸が出現する
4. 手を閉じるか下ろすと消える

> Camera API は HTTPS が必須だが、`localhost` は例外として許可されるので開発サーバーのままで動作する。

## npm scripts

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動（HMR 付き） |
| `npm run build` | 型チェック + 本番ビルド（`dist/` に出力） |
| `npm run preview` | ビルド済みの `dist/` をローカルで確認 |
| `npm run typecheck` | 型チェックのみ |

## 技術スタック

- **TypeScript + Vite**
- **[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)**（`@mediapipe/tasks-vision`）：手のランドマーク検出
  - JS API は npm パッケージから読み込む。wasm 本体とモデルはサイズが大きいため CDN / Google Cloud Storage から読み込む
- **[three.js](https://threejs.org/)**：球体エフェクトの3D描画
- UI はフレームワークを使わず DOM を直接操作する

## アーキテクチャ

レイヤードアーキテクチャ（DDD 風）を採用している。

- 依存の向き：`presentation → application → domain`
- `domain` / `application` 層はカメラ・MediaPipe・three.js に依存しない純粋なロジックとして保つ
- `infrastructure` 層で外部技術を包み込み、上位の層からは抽象として扱う

```
index.html                         # エントリー HTML
styles/main.css                    # 全体のスタイル
docs/rasengan-reference.jpg        # 見た目の参考画像（コードからは読み込んでいない）
src/
├── main.ts                        # コンポジションルート。各層を組み立ててフレームループを回す
├── types.ts                       # 共有する基本型（Point2D, Landmark）
├── domain/
│   ├── Hand.ts                    # 検出された手の値オブジェクト（開いた手かどうかの判定など）
│   └── PalmHoldDetector.ts        # 「手のひらを掲げ続けている」状態の検知（デバウンス付き）
├── application/
│   └── SummonRasenganUseCase.ts   # 1フレーム分のランドマークから、螺旋丸を出すかどうかを判断する
├── infrastructure/
│   ├── Camera.ts                  # getUserMedia のラッパー
│   └── MediaPipeHandTracker.ts    # MediaPipe HandLandmarker のアダプタ
└── presentation/
    ├── HandOverlayRenderer.ts     # 手の骨格を Canvas 2D で描画
    ├── Hud.ts                     # ステータス文言と発動ゲージの更新
    ├── RasenganEffect.ts          # 螺旋丸エフェクト本体（three.js）。レンダラー・カメラ・出現/追従の制御
    └── rasengan/                  # RasenganEffect の部品
        ├── constants.ts           # 共有定数（基準半径・描画順）
        ├── random.ts              # 乱数ヘルパー
        ├── shaders.ts             # GLSL シェーダー
        ├── textures.ts            # ハロー・中心の光・風の弧用テクスチャの生成
        ├── RasenganBody.ts        # 球本体（ハロー・半透明の球・中心の白い光）
        ├── ChakraThreads.ts       # 球の中で絡み合って回るチャクラの線
        └── WindArcs.ts            # 球の外側を回る風の弧
```

## エフェクトの仕組み

[ics-creative/160907_magma_effect](https://github.com/ics-creative/160907_magma_effect) のレイヤー構成（発光リングなど）を出発点に、`docs/rasengan-reference.jpg` の見た目に合わせて作り直した。

| レイヤー | 実装 |
| --- | --- |
| 球本体 | 正面ほど白っぽい水色、縁ほど濃い青になる半透明の球。縁のごく外周は透かして柔らかくする。中心には白い光の玉を加算で重ねる |
| ハロー | 球の背後に置いた青い放射グラデーションのビルボード。縁が光ってにじんで見える |
| チャクラの線 | 球の中の大きさの違う殻の上に、細い円弧を260本置く。1本ずつ別の軸・速さで回す（回転は頂点シェーダー）。手前と奥の線が違う方向に流れるので、立体の毛糸玉に見える。奥側の線は暗くする |
| 風の弧 | 球の外側を大きく回る、薄く半透明な弧。参照実装の Flare のリング生成を、弧を切り出せるよう拡張した |

- カメラは遠近（`PerspectiveCamera`）にしている。z=0 の平面上では映像のピクセル座標がそのままワールド座標の XY に対応するように置き、手のひらの2D座標に直接重ねる
- 球本体・ハロー・風の弧は通常の半透明合成で描く。加算合成は背景より明るくすることしかできず、白い壁や肌の上では白く飛んで青にならないため。線だけは青い球の上で光らせるため加算合成にしている

## 見た目の確認

`npm run dev` で起動し、URL に `?preview` を付けて開く（例：`http://localhost:5173/?preview`）。カメラと手の検出を使わずに、画面中央に螺旋丸を出し続ける。
`?preview&bg=light` にすると背景が明るくなり、白い壁や肌の上での見え方を確認できる。
