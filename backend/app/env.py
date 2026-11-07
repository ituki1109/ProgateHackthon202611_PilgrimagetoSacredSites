"""backend/.env を読み込み、環境変数に入れます。

python-dotenv は使わず（docs/design.md の「構成」にないため）、
`KEY=VALUE` の行だけを読む簡単な作りにしています。
すでに環境変数で設定されている値は上書きしません。
"""

from __future__ import annotations

import os
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_env() -> None:
    if not ENV_PATH.exists():
        return

    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())
