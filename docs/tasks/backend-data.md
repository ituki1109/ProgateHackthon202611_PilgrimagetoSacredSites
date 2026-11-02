# バックエンドA：データと推薦

オープンデータから地点の一覧を作り、現在地に合わせて推薦地点を選ぶ担当です。ProjectLINKS のハッカソンなので、審査でいちばん見られる部分です。

## 書くファイル

- `data/prepare.py`
- `data/README.md`
- `backend/data/spots.json`（`prepare.py` で作る）
- `backend/app/recommend.py`

## must

must の1〜4は作成済みです（`data/prepare.py`、`backend/data/spots.json`、`backend/app/recommend.py`）。

### 1. データを読む（最初に）

使うデータと対象地域（神奈川県川崎市）は決まっています。まず [data/README.md](../../data/README.md) を読み、3つのファイルをダウンロードして `data/raw/` に置きます。

- PLATEAU 川崎市の関連データセット（`14130_kawasaki-shi_2022_related.zip`）
- 国土数値情報 駅別乗降客数（`S12-25_GML.zip`）
- 川崎市 公共施設一覧（`141305_public_facility.csv`）

**できあがり:** 3つのファイルを読み込み、`data/README.md` に書いた列があることを確かめた。

### 2. spots.json を作る

`data/prepare.py` で、[data/README.md](../../data/README.md) の「spots.json の作り方」のとおりに、[api.md](../api.md) の「spots.json の形」で書き出します。

- 元のデータは `data/raw/` に置き、git には入れない
- 座標は緯度と経度（WGS84）にそろえる
- 公共施設一覧は Shift_JIS で読む

**できあがり:** `python data/prepare.py` で `backend/data/spots.json` ができる。

### 3. 推薦の処理を書く

`backend/app/recommend.py` に、次の形の関数を作ります。バックエンドB の API がこれを呼びます。

```python
def recommend(spots: list[dict], lat: float, lng: float, limit: int = 5) -> list[dict]:
    """現在地に近く、データの値から見て良い地点を、点数の高い順に返す。"""
```

- 返す形は [api.md](../api.md) の `GET /recommend` と同じにする（`id`、`name`、`lat`、`lng`、`score`、`reason`）
- 点数は、[data/README.md](../../data/README.md) の「推薦のルール」に従う。重みはデモを見ながら調整する
- `score` は 0〜1 にそろえる
- 同じ入力なら同じ結果を返す（乱数を使わない）

**できあがり:** 現在地を変えると結果が変わり、`attrs` の値を変えても結果が変わる。

### 4. 推薦理由を書く

`reason` には、データから分かる事実だけを書きます。[data/README.md](../../data/README.md) の「推薦理由」のように、点数への寄与が大きい要素から順に、決まった文の型に値を差し込んで書きます。

- データから分からないこと（混雑、撮影のしやすさ、安全さ）は書かない
- 「怨念が強い場所」のように、データにない意味を付けない

## should

- **推薦の重みと推薦地点の種類の調整。** 作成済みです。施設の種類ごとの値、同じ建物の除外、カテゴリの偏りの抑え方は [data/README.md](../../data/README.md) の「推薦のルール」にあります。
- **中間発表で配られるデータの取り込み。** 足すための仕組みは作成済みです。データが配られたら、[data/README.md](../../data/README.md) の「あとから足すデータ」の手順で `EXTRA_SOURCES` と `EXTRA_RULES` に1つずつ足します。

## 注意

- 列や項目は、実際のデータを開いて確かめてから使う。存在を確かめていない列を前提にコードを書かない。
- 前処理は本番前に済ませる。本番中は `spots.json` を読むだけにする。

## AI への最初の指示の例

> docs/design.md、docs/api.md、docs/tasks/backend-data.md、data/README.md を読んでください。私はバックエンドA の担当です。data/raw/ に3つのファイルを置きました。まず各ファイルの列を調べ、data/README.md に書いた列があるかを確かめてください。列を確かめる前に spots.json を作るコードは書かないでください。
