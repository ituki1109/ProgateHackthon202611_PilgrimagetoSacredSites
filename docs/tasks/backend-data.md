# バックエンドA：データと推薦

オープンデータから地点の一覧を作り、現在地に合わせて推薦地点を選ぶ担当です。ProjectLINKS のハッカソンなので、審査でいちばん見られる部分です。

## 書くファイル

- `data/prepare.py`
- `data/README.md`
- `backend/data/spots.json`（`prepare.py` で作る）
- `backend/app/recommend.py`

## must

### 1. データを読む（最初に）

使うデータと対象地域（富山県高岡市）は決まっています。まず [data/README.md](../../data/README.md) を読み、3つのファイルをダウンロードして `data/raw/` に置きます。

- 高岡市施設一覧（`20260401_sisetu.csv`）
- 国土数値情報 駅別乗降客数（`S12-25_GML.zip`）
- Project LINKS 空き家・空き地バンク登録物件データ（`01_tourokubukken.csv`）

**できあがり:** 3つのファイルを読み込み、`data/README.md` に書いた列があることを確かめた。

### 2. spots.json を作る

`data/prepare.py` で、[data/README.md](../../data/README.md) の「spots.json の作り方」のとおりに、[api.md](../api.md) の「spots.json の形」で書き出します。

- 元のデータは `data/raw/` に置き、git には入れない
- 座標は緯度と経度（WGS84）にそろえる
- 施設一覧は Shift_JIS、空き家バンクは UTF-8（BOM つき）で読む

**できあがり:** `python data/prepare.py` で `backend/data/spots.json` ができる。

### 3. 推薦の処理を書く

`backend/app/recommend.py` に、次の形の関数を作ります。バックエンドB の API がこれを呼びます。

```python
def recommend(spots: list[dict], lat: float, lng: float, limit: int = 5) -> list[dict]:
    """現在地に近く、データの値から見て良い地点を、点数の高い順に返す。"""
```

- 返す形は [api.md](../api.md) の `GET /recommend` と同じにする（`id`、`name`、`lat`、`lng`、`score`、`reason`）
- 点数は、[data/README.md](../../data/README.md) の「推薦のルール（案）」から始め、デモを見ながら重みを調整する
- `score` は 0〜1 にそろえる
- 同じ入力なら同じ結果を返す（乱数を使わない）

**できあがり:** 現在地を変えると結果が変わり、`attrs` の値を変えても結果が変わる。

### 4. 推薦理由を書く

`reason` には、データから分かる事実だけを書きます。[data/README.md](../../data/README.md) の推薦理由の例のように、決まった文の型に値を差し込めば十分です。

- データから分からないこと（混雑、撮影のしやすさ、安全さ）は書かない
- 空き家バンクの登録物件の数を「空き家が多い」「人が少ない」と言い換えない
- 「怨念が強い場所」のように、データにない意味を付けない

## should

- **中間発表で配られるデータの取り込み。** 本番前日に配られるデータを `prepare.py` に足し、`attrs` を増やす。`prepare.py` は、データの読み込みと `spots.json` への書き出しを関数で分けておくと足しやすい。

## 注意

- 列や項目は、実際のデータを開いて確かめてから使う。存在を確かめていない列を前提にコードを書かない。
- 前処理は本番前に済ませる。本番中は `spots.json` を読むだけにする。

## AI への最初の指示の例

> docs/design.md、docs/api.md、docs/tasks/backend-data.md、data/README.md を読んでください。私はバックエンドA の担当です。data/raw/ に3つのファイルを置きました。まず各ファイルの列を調べ、data/README.md に書いた列があるかを確かめてください。列を確かめる前に spots.json を作るコードは書かないでください。
