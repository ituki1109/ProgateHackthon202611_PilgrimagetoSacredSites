# Docker での動かし方

`Dockerfile` と `docker-compose.yml` で、API・画面・写真の配信を 1 つのコンテナにまとめています。
設計（[design.md](design.md)）のとおり、FastAPI が `frontend/` の画面と `backend/uploads/` の写真も配るため、
Web サーバーを別に立てる必要はありません。

## いちばん短い手順

リポジトリの直下で実行します。

```bash
docker compose up --build
```

起動したら、ブラウザで <http://localhost:8000/> を開きます。
止めるときは `Ctrl+C`、バックグラウンドで動かした場合は次を実行します。

```bash
docker compose down
```

## ファイルの役割

| ファイル | 役割 |
|---|---|
| `Dockerfile` | Python 3.12 のイメージを作り、依存を入れ、uvicorn で起動する |
| `docker-compose.yml` | ポート、環境変数、写真の保存場所、再起動の設定をまとめる |
| `Docker/entrypoint.sh` | 起動時に `seed.py` を実行するかどうかを決める |
| `.dockerignore` | イメージに不要なもの（`.git`、`data/raw`、DB、写真など）を送らない |

## Dockerfile の解説

### 1. ベースイメージ

```dockerfile
FROM python:3.12-slim
```

`requirements.txt` は FastAPI・uvicorn・python-multipart だけなので、軽い `slim` で足ります。
`pandas` と `GeoPandas` はデータの前処理（`data/prepare.py`）で使うもので、実行時には不要です。

### 2. 環境変数

```dockerfile
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Tokyo
```

- `TZ=Asia/Tokyo`：`date.today()` と `datetime.now()` を日本時間で動かすため。怨念の日数と `created_at` がずれなくなります。
- `PYTHONUNBUFFERED=1`：ログをすぐ表示するため。
- `PYTHONDONTWRITEBYTECODE=1`：不要な `.pyc` を作らないため。
- `PIP_NO_CACHE_DIR=1`：イメージを小さくするため。

`tzdata` を入れているのは、`slim` イメージで `Asia/Tokyo` を確実に解決するためです。

### 3. 依存のインストール

```dockerfile
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
```

コードより先に `requirements.txt` だけコピーしています。
コードを変えたときはこの層がキャッシュされ、`pip install` をやり直さずに済みます。

### 4. コードの配置

```dockerfile
COPY backend /app/backend
COPY frontend /app/frontend
```

`backend/app/main.py` は、次のように **backend の親にある frontend** を探します。

```python
FRONTEND_DIR = db.BASE_DIR.parent / "frontend"
```

そのため `/app/backend` と `/app/frontend` を兄弟に置いています。
ここを崩すと画面が配られず、`/` が `{"detail": "frontend is not ready"}` になります。

### 5. 起動

```dockerfile
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- `--host 0.0.0.0` は必須です。`127.0.0.1` のままだとコンテナの外から届きません。
- `--reload` は付けません。開発時にホストで動かすときだけ使います。
- ワーカーは 1 つです。SQLite への書き込みと、起動時に読み込む `SPOTS` を考えて、増やさないでください。

## docker-compose.yml の解説

### ポート

```yaml
ports:
  - "8000:8000"
```

ホストの 8000 番をコンテナの 8000 番につなぎます。
ホスト側で 8000 番が使われているときは、`"8001:8000"` に変えて <http://localhost:8001/> を開きます。

### 環境変数

```yaml
environment:
  TZ: Asia/Tokyo
  SEED_ON_START: "1"
```

`SEED_ON_START` で、起動時のデモデータの扱いを選びます。

| 値 | 動き | 使う場面 |
|---|---|---|
| `1`（既定） | 起動のたびに DB を空にして、ぬい3体と訪問を入れ直す | デモ。いつも同じ状態から始められる |
| `0` | DB がない最初の起動だけ入れる | 記録を残しながら開発する |
| `never` | `seed.py` を実行しない | 自分で好きなタイミングで入れたい |

`seed.py` は「今日」を基準に日付を作るため、**イメージのビルド時ではなく起動時に実行**しています。
ビルド時に実行すると日付が古くなり、怨念の値がデモの想定とずれます。

### 写真の保存

```yaml
volumes:
  - uploads:/app/backend/uploads
```

`uploads` は compose が作る named volume です。
コンテナを作り直しても、登録したぬいの写真と訪問の写真は残ります。

`seed.py` が使うデモ用の画像は `backend/scripts/demo_photos/` にあり、イメージに含まれます。

### 訪問の記録（SQLite）を残す場合

既定では DB はコンテナの中だけにあり、`SEED_ON_START=1` のため起動のたびに作り直されます。
記録を残したいときは、`docker-compose.yml` の次の行を有効にします。

```yaml
volumes:
  - ./backend/nuitsuki.db:/app/backend/nuitsuki.db
```

その前に、ホスト側で空のファイルを作っておきます。

```bash
touch backend/nuitsuki.db
```

ファイルを bind mount するため、ファイルがないと Docker がディレクトリを作ってしまい、SQLite が開けなくなります。
併せて `SEED_ON_START` を `0` にすると、記録が消えません。

### ヘルスチェック

```yaml
healthcheck:
  test:
    - CMD
    - python
    - -c
    - "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/nuis').status == 200 else 1)"
```

`curl` を入れずに、Python だけで `GET /nuis` を叩いて生存確認します。
`docker compose ps` の STATUS が `healthy` になれば起動完了です。

### 再起動

```yaml
restart: unless-stopped
```

PC を再起動したときなどに、手動で止めていない限りコンテナを立ち上げ直します。

## よく使うコマンド

```bash
# イメージを作り直して起動
docker compose up --build

# バックグラウンドで起動
docker compose up -d --build

# ログを見る
docker compose logs -f app

# 状態を見る
docker compose ps

# 止めてコンテナを消す（named volume の写真は残る）
docker compose down

# 写真の volume も消す
docker compose down -v

# デモデータを今すぐ入れ直す（起動中のコンテナで実行）
docker compose exec app python scripts/seed.py

# コンテナの中で推薦のテストを実行する（開発用の依存が別途必要）
docker compose run --rm app sh -c "pip install -r requirements-dev.txt && python -m pytest tests"
```

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| `http://localhost:8000/` が開かない | 起動完了前か、ポートが埋まっている。`docker compose logs -f app` を見る。`docker compose ps` で `healthy` を確認する |
| `{"detail": "frontend is not ready"}` が出る | `frontend/` が `/app/frontend` にない。ビルドコンテキストがリポジトリ直下かを確認する |
| 怨念の日数や日時がずれる | `TZ=Asia/Tokyo` が外れている。`docker compose exec app date` で確認する |
| 写真が表示されない | `uploads` volume の権限、または `/uploads` のマウントを確認する |
| 記録が再起動で消える | 既定の `SEED_ON_START=1` の動き。残したいときは `0` にして DB を bind mount する |
| 地図が表示されない | Leaflet を CDN から読むため、ブラウザ側のネットワークを確認する（コンテナ側ではない） |
| `port is already allocated` | ホストの 8000 番が使用中。compose の ports を `"8001:8000"` に変える |

## 設計との関係

- 実行時に足すライブラリはありません。`requirements.txt` の 3 つだけを使います。
- API の項目名・形（[api.md](api.md)）は変えていません。
- 画面はビルド不要の素の HTML / JavaScript のままです。Docker は配信方法だけを変えます。
- `data/prepare.py` と `data/raw/` はイメージに入れません。`backend/data/spots.json` が同梱済みのため、前処理なしで動きます。
