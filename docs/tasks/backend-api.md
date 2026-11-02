# バックエンドB：API と怨念の計算

画面とデータをつなぐ API と、怨念の計算を作る担当です。画面のファイルも、この API のサーバーから配ります。

## 書くファイル

- `backend/app/main.py`
- `backend/app/db.py`
- `backend/app/grudge.py`
- `backend/scripts/seed.py`
- `backend/requirements.txt`

## must

### 1. API のサーバーを用意する

- FastAPI のアプリを作り、`uvicorn app.main:app --reload --port 8000` で起動できるようにする
- `frontend/` を `/` で、`backend/uploads/` を `/uploads` で配る
- データベースは SQLite のファイル1つ（`backend/nuitsuki.db`、git に入れない）
- 表は `nuis` と `visits` の2つ。項目は [api.md](../api.md) の Nui と Visit に合わせる（`grudge` と `visit_count` は保存せず、返すときに計算する）

**できあがり:** 起動して `http://localhost:8000/` で画面が開く。

### 2. ぬいの API

`GET /nuis` と `POST /nuis` を [api.md](../api.md) のとおりに作ります。写真は `backend/uploads/` に保存し、URL を返します。

### 3. 推薦の API

`GET /recommend` を作ります。起動時に `backend/data/spots.json` を読み込み、バックエンドA の `recommend()` を呼びます。

`recommend.py` がまだないうちは、`spots.json` の先頭5件をそのまま返す仮の関数で進めてください。

### 4. 訪問の API

`POST /visits` と `GET /nuis/{id}/visits` を作ります。

- `spot_id` があれば、地点の名前を `spots.json` から取り、`recommended` を true にする
- `spot_id` が `spots.json` にないときは 404 を返す
- 返り値に、記録の前後の怨念（`grudge_before`、`grudge_after`）を入れる

### 5. 怨念の計算

`backend/app/grudge.py` に、[design.md](../design.md) の「怨念の計算」をそのまま書きます。

```python
GRUDGE_PER_DAY = 2
CALM_RECOMMENDED = 30
CALM_OTHER = 10

def calc_grudge(last_outing_date: date, visits: list[dict], today: date) -> int:
    ...
```

`today` を引数で受けると、日付を変えて確かめやすくなります。

### 6. デモ用のデータ

`backend/scripts/seed.py` で、データベースを空にしてから、ぬい3体と訪問の記録を入れます。

- 怨念の強さがばらけるようにする（強い、中くらい、弱い）
- デモの最初に1回実行すれば、毎回同じ状態から始められる

**できあがり:** `python scripts/seed.py` のあと、`GET /nuis` で3体が返る。

## should

- **鎮まったときの演出の値。** `POST /visits` の返り値で足りないものがあれば、画面の担当と相談して足す（足すときは先に [api.md](../api.md) を直す）。

## 注意

- 項目名と形は [api.md](../api.md) から変えない。変えるときは先に文書を直し、全員に伝える。
- 画面と同じサーバーから配るので、CORS の設定は要らない。仮の JSON で作っている画面の担当が別のポートから呼ぶときだけ、`http://localhost:5500` を許可する。

## AI への最初の指示の例

> docs/design.md、docs/api.md、docs/tasks/backend-api.md を読んでください。私はバックエンドB の担当です。まず must の1（サーバーの用意）と5（怨念の計算）を作ってください。API の項目名は docs/api.md から変えないでください。
