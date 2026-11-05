#!/bin/sh
# コンテナ起動時に、デモ用データを入れるかどうかを決めてから uvicorn を起動する。
set -e

case "${SEED_ON_START:-1}" in
  1|true|yes)
    # 毎回 DB を空にして、ぬい3体と訪問の記録を入れ直す（デモ向き）
    python scripts/seed.py
    ;;
  0|auto)
    # DB がない最初の起動のときだけ入れる
    if [ ! -f /app/backend/nuitsuki.db ]; then
      python scripts/seed.py
    fi
    ;;
  never|false|no)
    # 何もしない（自分で seed したいとき）
    ;;
  *)
    echo "SEED_ON_START の値が不正です: ${SEED_ON_START}（1 / 0 / never のどれか）" >&2
    exit 1
    ;;
esac

# Dockerfile の CMD（uvicorn）を実行する
exec "$@"
