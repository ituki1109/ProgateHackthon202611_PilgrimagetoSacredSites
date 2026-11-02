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
  "spot_id": "takaoka_113",
  "spot_name": "高岡御車山会館",
  "lat": 36.746688,
  "lng": 137.009798,
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

登録したぬいを、Nui の形で返します（状態コード 201）。

## GET /recommend

| 項目 | 必須 | 内容 |
|---|---|---|
| `lat` | 必須 | 現在地の緯度 |
| `lng` | 必須 | 現在地の経度 |

点数の高い順に、上位5件を返します。

```json
[
  {
    "id": "takaoka_113",
    "name": "高岡御車山会館",
    "lat": 36.746688,
    "lng": 137.009798,
    "score": 0.82,
    "reason": "片原町駅から徒歩4分の観光・産業。この駅を最寄りとする空き家バンクの登録物件は6件"
  }
]
```

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 文字列 | 地点の ID。`spots.json` の `id` と同じ |
| `name` | 文字列 | 地点の名前 |
| `lat`、`lng` | 数値 | 地点の位置 |
| `score` | 数値（0〜1） | 推薦の点数 |
| `reason` | 文字列 | 推薦の理由。データから分かる事実だけを書く |

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
    "id": "takaoka_113",
    "name": "高岡御車山会館",
    "lat": 36.746688,
    "lng": 137.009798,
    "category": "観光・産業",
    "attrs": {
      "nearest_station": "片原町",
      "station_distance_m": 280,
      "station_passengers": 100,
      "akiya_count": 6
    }
  }
]
```

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 文字列 | 地点の ID。`takaoka_` に高岡市施設一覧の `新番号` を付けた値 |
| `name` | 文字列 | 地点の名前 |
| `lat`、`lng` | 数値 | 緯度と経度（世界測地系 WGS84） |
| `category` | 文字列 | 高岡市施設一覧の `ジャンル`（公園・緑地、観光・産業、文化・生涯学習） |
| `attrs.nearest_station` | 文字列 | いちばん近い駅の名前 |
| `attrs.station_distance_m` | 整数 | その駅までの直線距離（メートル） |
| `attrs.station_passengers` | 整数 | その駅の1日の乗降客数（2024年度、路線の合計） |
| `attrs.akiya_count` | 整数 | その駅を最寄りとする空き家バンク登録物件の数 |

データの出典と作り方は [data/README.md](../data/README.md) にあります。
