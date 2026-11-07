# API 仕様

画面と API はこの形でやり取りします。変えるときは、先にこの文書を直して全員に伝えてください。

## 共通

- 返す値はすべて JSON です。写真を送るときだけ `multipart/form-data` で送ります。
- 日付は `YYYY-MM-DD`、日時は `YYYY-MM-DDTHH:MM:SS` の文字列です。
- 写真は `/uploads/ファイル名` の URL で返します。
- 失敗したときは、FastAPI の標準の形で返します。

```json
{ "detail": "nui not found" }
```

| 状態コード | 場面 |
|---|---|
| 200 | 成功 |
| 201 | 登録に成功 |
| 404 | ぬいや地点が見つからない |
| 422 | 送った値が足りない、形が違う |

## 一覧

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/nuis` | ぬいの一覧（怨念の強さを含む） |
| POST | `/nuis` | ぬいの登録 |
| GET | `/recommend?lat=&lng=` | 推薦地点（上位5件、理由つき） |
| POST | `/visits` | 訪問の記録（ぬい、地点、写真） |
| GET | `/nuis/{id}/visits` | ぬいごとの思い出 |

## ぬい（Nui）

```json
{
  "id": 1,
  "name": "もちもち",
  "photo_url": "/uploads/nui_1.jpg",
  "last_outing_date": "2025-10-01",
  "grudge": 82,
  "visit_count": 2
}
```

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 整数 | ぬいの番号 |
| `name` | 文字列 | ぬいの名前 |
| `photo_url` | 文字列か null | ぬいの写真。登録時に送らなければ null |
| `last_outing_date` | 文字列（日付） | 登録時に入れた、最後に連れ出した日 |
| `grudge` | 整数（0〜100） | 怨念の強さ。[design.md](design.md) の計算で API が出す |
| `visit_count` | 整数 | 訪問の記録の数 |

## 訪問（Visit）

```json
{
  "id": 5,
  "nui_id": 1,
  "spot_id": "park_0798",
  "spot_name": "富士見公園",
  "lat": 35.529843,
  "lng": 139.710875,
  "photo_url": "/uploads/visit_5.jpg",
  "recommended": true,
  "created_at": "2026-11-07T14:30:00"
}
```

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 整数 | 記録の番号 |
| `nui_id` | 整数 | 連れて行ったぬい |
| `spot_id` | 文字列か null | 推薦地点の ID。推薦地点以外で記録したときは null |
| `spot_name` | 文字列 | 地点の名前。推薦地点以外では、画面で入れた名前 |
| `lat`、`lng` | 数値 | 記録した位置 |
| `photo_url` | 文字列か null | 撮った写真 |
| `recommended` | 真偽値 | 推薦地点での記録なら true（`spot_id` があれば true） |
| `created_at` | 文字列（日時） | 記録した日時 |

## GET /nuis

ぬいの一覧を、登録した順に返します。

```json
[ { "id": 1, "name": "もちもち", "...": "Nui の形" } ]
```

## POST /nuis

`multipart/form-data` で送ります。

| 項目 | 必須 | 内容 |
|---|---|---|
| `name` | 必須 | ぬいの名前 |
| `last_outing_date` | 必須 | 最後に連れ出した日（`YYYY-MM-DD`） |
| `photo` | 任意 | ぬいの写真 |
| `stylize` | 任意（既定 `true`） | `true` なら、写真を Gemini でキャラクター化してから保存する（`photo_url` がそのイラストになる）。`false` なら写真をそのまま保存する。`GEMINI_API_KEY` がないときは、`true` でも元の写真のまま保存する |

登録したぬいを、Nui の形で返します（状態コード 201）。`photo_url` は、`stylize` が効いていればキャラクター化した画像の URL です。

## GET /recommend

| 項目 | 必須 | 内容 |
|---|---|---|
| `lat` | 必須 | 現在地の緯度 |
| `lng` | 必須 | 現在地の経度 |

点数の高い順に、上位5件を返します。

```json
[
  {
    "id": "park_0798",
    "name": "富士見公園",
    "lat": 35.529843,
    "lng": 139.710875,
    "score": 0.64,
    "reason": "現在地から約1.3km。広さ11.7haの総合公園で、半径3km以内の公園で一番広い。港町駅から徒歩8分",
    "category": "公園・緑地",
    "attrs": { "nearest_station": "港町", "station_distance_m": 602, "...": "spots.json の attrs と同じ" },
    "details": { "address": null, "opened_year": 1957, "...": "spots.json の details と同じ" }
  }
]
```

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 文字列 | 地点の ID。`spots.json` の `id` と同じ |
| `name` | 文字列 | 地点の名前 |
| `lat`、`lng` | 数値 | 地点の位置 |
| `score` | 数値（0〜1） | 推薦の点数 |
| `reason` | 文字列 | 推薦の理由。その地点を選んだわけを、点数への寄与が大きい要素から順に書く。どれもデータから分かる事実（書き方は [data/README.md](../data/README.md) の「推薦理由」） |
| `category` | 文字列 | 地点のカテゴリ。`spots.json` の `category` と同じ |
| `attrs` | オブジェクト | 地点の属性。`spots.json` の `attrs` と同じ |
| `details` | オブジェクト | 地点の詳細（住所、時間など）。`spots.json` の `details` と同じ。画面の「地点の詳細」に出す |

## POST /visits

`multipart/form-data` で送ります。

| 項目 | 必須 | 内容 |
|---|---|---|
| `nui_id` | 必須 | 連れて行ったぬい |
| `spot_id` | 任意 | 推薦地点で記録するときの地点 ID |
| `spot_name` | `spot_id` がないとき必須 | 地点の名前 |
| `lat`、`lng` | 必須 | 記録した位置 |
| `photo` | 任意 | 撮った写真 |

`spot_id` を送ったときは、地点の名前を `spots.json` から取ります。

記録と、記録の前後の怨念を返します（状態コード 201）。画面はこの値で、鎮まった演出を出します。

```json
{
  "visit": { "id": 5, "...": "Visit の形" },
  "grudge_before": 82,
  "grudge_after": 52
}
```

## GET /nuis/{id}/visits

そのぬいの訪問の記録を、新しい順に返します。

```json
[ { "id": 5, "...": "Visit の形" } ]
```

## spots.json の形

バックエンドA が作り、バックエンドB の API が読み込むファイルです。画面からは直接読みません。

```json
[
  {
    "id": "park_0799",
    "name": "等々力緑地",
    "lat": 35.584789,
    "lng": 139.65134,
    "category": "公園・緑地",
    "attrs": {
      "nearest_station": "武蔵中原",
      "station_distance_m": 956,
      "station_passengers": 55204,
      "area_m2": 365886,
      "park_type": "総合公園",
      "facility_type": null
    },
    "details": {
      "address": null,
      "phone": null,
      "hours": null,
      "hours_note": null,
      "description": null,
      "url": null,
      "opened_year": 1965,
      "amenities": []
    }
  },
  {
    "id": "facility_141305000015",
    "name": "ミューザ川崎シンフォニーホール",
    "lat": 35.530981,
    "lng": 139.694692,
    "category": "文化・生涯学習",
    "attrs": {
      "nearest_station": "川崎",
      "station_distance_m": 196,
      "station_passengers": 388782,
      "area_m2": null,
      "park_type": null,
      "facility_type": "音楽ホール"
    },
    "details": {
      "address": "神奈川県川崎市幸区大宮町1310",
      "phone": "044-520-0100",
      "hours": "9:00〜22:00",
      "hours_note": "休館日は年末年始（12/29～1/3）、保守点検日",
      "description": "2004年7月にオープン。国内最大級のパイプオルガンを備え、…",
      "url": "http://www.kawasaki-sym-hall.jp/",
      "opened_year": null,
      "amenities": ["車椅子で入れる", "バリアフリートイレ", "おむつ替え"]
    }
  }
]
```

`attrs` は推薦の点数と理由に使う値、`details` は画面に出すだけの値です。`details` の項目は [data/README.md](../data/README.md) の「spots.json の作り方」に書いています。

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 文字列 | 地点の ID。公園は `park_` ＋並び順の4桁、施設は `facility_` ＋川崎市公共施設一覧の `ID` |
| `name` | 文字列 | 地点の名前 |
| `lat`、`lng` | 数値 | 緯度と経度（世界測地系 WGS84） |
| `category` | 文字列 | `公園・緑地` か `文化・生涯学習` |
| `attrs.nearest_station` | 文字列 | いちばん近い駅の名前 |
| `attrs.station_distance_m` | 整数 | その駅までの直線距離（メートル） |
| `attrs.station_passengers` | 整数 | その駅の1日の乗降客数（2024年度、路線の合計） |
| `attrs.area_m2` | 整数か null | 公園の面積（㎡）。施設は null |
| `attrs.park_type` | 文字列か null | 公園の種類（街区公園、総合公園など）。施設は null |
| `attrs.facility_type` | 文字列か null | 施設の種類（博物館・美術館、図書館など）。公園は null |

中間発表で配られるデータを足すと、`attrs` に項目が増えます（[data/README.md](../data/README.md) の「あとから足すデータ」）。`GET /recommend` の返す形は変わりません。

データの出典と作り方は [data/README.md](../data/README.md) にあります。
