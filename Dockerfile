# ぬい憑きの実行用イメージ。
# FastAPI が API と frontend/ の画面、backend/uploads/ の写真をまとめて配る。

FROM python:3.12-slim

# - 日時は date.today() / datetime.now() を使うため、日本時間にそろえる
# - Python の出力をすぐ出し、.pyc は作らない
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Tokyo

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存だけ先にコピーして、コードを変えても pip install をやり直さない
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# main.py は backend の親にある frontend を探すので、兄弟ディレクトリに置く
COPY backend /app/backend
COPY frontend /app/frontend
COPY Docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/backend/uploads

WORKDIR /app/backend

EXPOSE 8000

# entrypoint が seed の実行を制御してから uvicorn を起動する
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
