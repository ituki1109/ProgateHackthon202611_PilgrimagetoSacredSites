# フロントA：画面の骨組み、地図、訪問の記録

画面全体の骨組みと、地図で推薦地点を選んで訪問を記録する流れを作る担当です。フロントB が作る画面も、この骨組みの上に載ります。

## 書くファイル

- `frontend/index.html`（骨組み。フロントB の画面の部分を除く）
- `frontend/js/api.js`
- `frontend/js/main.js`
- `frontend/js/map.js`
- `frontend/js/spot-detail.js`
- `frontend/js/visit.js`
- `frontend/ar/`

## must

### 1. 骨組みと画面の切り替え（最初に）

フロントB が作業を始められるよう、最初に作ります。

- `index.html` は1ページで、画面ごとに `<section>` を分ける
- URL の `#` で画面を切り替える（`#map`、`#nuis`、`#nui/1`、`#register`、`#visit`）
- 画面の下か上に、地図、ぬい一覧、登録への移動ボタンを置く

画面と担当は次のとおりです。

| 画面 | `#` | 担当 |
|---|---|---|
| 地図と推薦地点 | `#map` | フロントA |
| 訪問の記録 | `#visit` | フロントA |
| ぬいの一覧 | `#nuis` | フロントB |
| ぬいの思い出 | `#nui/1` | フロントB |
| ぬいの登録 | `#register` | フロントB |

### 2. API の呼び出しをまとめる

`frontend/js/api.js` に、[api.md](../api.md) の API を呼ぶ関数を並べます。ほかの JS は `fetch` を直接書かず、この関数を使います。

```js
export const USE_MOCK = false; // 仮の JSON で画面を作るときだけ true にする

export async function getNuis() {}
export async function createNui(formData) {}
export async function getRecommend(lat, lng) {}
export async function createVisit(formData) {}
export async function getVisits(nuiId) {}
export async function getCalmPreview({ nuiId, spotId, spotName, lat, lng }) {}
```

`getCalmPreview` は `GET /visits/preview` を呼び、記録前の除霊量を返します。

`USE_MOCK` が true のときは、`frontend/mock/` の JSON を返します。`createNui` と `createVisit` は、仮の値を返すだけで構いません。

**できあがり:** フロントB が `api.js` の関数を呼んで、仮の JSON で画面を作れる。

### 3. 地図と推薦地点

`frontend/js/map.js` で、Leaflet の地図に推薦地点を表示します。

- 地図は OpenStreetMap のタイルを使う
- 最初は川崎駅（緯度 35.5314、経度 139.6968）を中心に表示する
- 推薦地点にピンを立て、押すと名前と推薦理由が出る
- ピンから「ここで記録する」で `#visit` に進む
- 地図の下に、データの出典を表示する（文言は [data/README.md](../../data/README.md) の最後にある）

### 4. 現在地

対象地域は神奈川県川崎市です。デモで GPS がずれても進められるよう、現在地は地図で自由に変えられるようにします。

- 最初の現在地は川崎駅にする
- 地図をクリックしたら、そこを現在地として扱う
- 現在地が変わったら、推薦地点を取り直す
- 推薦地点のカードから記録するときも、送る `lat`、`lng` は現在地にする（地点までの距離で除霊量が変わるため）
- ブラウザーの位置情報で現在地を取るボタンもあってよい（川崎市の外なら推薦地点は出ない）

### 5. 訪問の記録

`frontend/js/visit.js` で、記録の画面を作ります。

1. 連れて行くぬいを選ぶ（怨念の強い順に並べる）。選ぶたびに `GET /visits/preview` を呼び、記録前の除霊量を `.stats` のカードで出す
2. 写真を選ぶか撮る（`<input type="file" accept="image/*" capture>`）
3. 送る
4. 返ってきた `grudge_before` と `grudge_after` を出す（例: 「怨念が 82 → 52 に鎮まった」）
5. 返ってきた `calm` の `amount` と内訳を出す（例: 「除霊量 30 / 基本 50 / 距離 285m」）

推薦地点では、地点までの距離と、同じ場所に続けて記録した回数で鎮まる量が減ることを画面に出す。距離が遠すぎて鎮まらなかったときは、その旨を出す。怨念が残りより少ないときは、「怨念が残り X のため、X 鎮まりました」と出す。

推薦地点を選ばずに記録するときは、地点の名前を入力させます。名前が空の間は「地点の名前を入れると除霊量が出ます」と出します。

新しい CSS クラスは作らず、既存の `.stats`、`.result-grudge`、`.result-diff`、`.field-note` を使います。`#visit-calm` は `visit.js` が動的に作り、`index.html` は触りません。

**できあがり:** 地図で地点を選び、ぬいと写真を送ると、記録前と記録後に除霊量とその内訳が分かる。

## should

- **AR の組み込み。** `frontend/ar/` に入れ、記録が終わった画面と、ぬいの一覧のカードにある「憑依を見る」から開けるようにしました。動かし方は [frontend/ar/README.md](../../frontend/ar/README.md) にあります。

## 注意

- ビルドの要るツール（npm、React など）は使わない。Leaflet は CDN から読み込む。
- フロントB の JS には、画面を表示する関数（例: `showNuis()`）を用意してもらい、`main.js` から呼ぶ。
- 他の担当が調整中の `frontend/css/style.css` と `frontend/index.html` は変えない。追加の要素は既存の CSS クラスを使い、HTML は JavaScript で動的に作る。

## AI への最初の指示の例

> docs/design.md、docs/api.md、docs/tasks/frontend-main.md を読んでください。私はフロントA の担当です。まず must の1（骨組み）と2（api.js）を作ってください。フレームワークやビルドツールは使わず、素の HTML と JavaScript で書いてください。
