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
src/
├── main.ts                        # コンポジションルート。各層を組み立ててフレームループを回す
├── types.ts                       # 共有する基本型（Point2D, Landmark）
├── domain/
│   ├── Hand.ts                    # 検出された手の値オブジェクト（開いた手かどうかの判定など）
│   └── PalmHoldDetector.ts        # 「手のひらを掲げ続けている」状態の検知（デバウンス付き）
├── application/
│   └── SummonMagicUseCase.ts      # 1フレーム分のランドマークから、エフェクトを出すかどうかを判断する
├── infrastructure/
│   ├── Camera.ts                  # getUserMedia のラッパー
│   └── MediaPipeHandTracker.ts    # MediaPipe HandLandmarker のアダプタ
└── presentation/
    ├── HandOverlayRenderer.ts     # 手の骨格を Canvas 2D で描画
    ├── Hud.ts                     # ステータス文言と発動ゲージの更新
    ├── MagmaOrbEffect.ts          # 球体エフェクト本体（three.js）
    └── assets/orb.jpg             # コア・オーラ・グローに使う光球画像
```

## エフェクトの仕組み

[ics-creative/160907_magma_effect](https://github.com/ics-creative/160907_magma_effect) の「マグマ球」のレイヤー構造をもとにしている。これを、手のひらに追従して出現し続けるオブジェクトとして移植した。
クラス名 `MagmaOrbEffect` はこの経緯に由来する。

| レイヤー | 実装 |
| --- | --- |
| コア | `orb.jpg` をマットキャップ方式でサンプリングする。自転させても継ぎ目が出ない |
| オーラ | コアと同じ画像を紫に色づけし、一回り大きくしてコアと逆向きに回転させる（加算合成） |
| リムライト | 縁だけが光るフレネル風の発光。参照実装は WebGPU/TSL なので、GLSL の `ShaderMaterial` で同じ見た目を再現した |
| 発光リング | 参照実装の Flare を移植した。傾きの異なる複数の帯を、それぞれ別の速度でスクロールさせる |
| 外周グロー | 背後に広がる加算合成のスプライト |
| 火の粉 | 常に発生し続けるポイントスプライトのパーティクル |

- `orb.jpg` は背景にチェッカー柄が焼き込まれた不透明な JPEG である。そのため読み込み後に放射状のマスクを掛けて、周縁部を透明にしてから使う
- カメラは正投影（`OrthographicCamera`）にしている。映像のピクセル座標をそのままワールド座標の XY に対応させ、手のひらの2D座標に直接重ねる

## その他

- `magic_gesture_prototype.html` は初期のスタンドアロン版プロトタイプ。`src/` の実装とは独立している
