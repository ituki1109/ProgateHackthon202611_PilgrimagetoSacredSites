"""SQLite の読み書き。

データベースは backend/nuitsuki.db の1ファイルだけ。
grudge と visit_count は保存せず、API が返すときに計算する。
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "nuitsuki.db"
UPLOAD_DIR = BASE_DIR / "uploads"
SPOTS_PATH = BASE_DIR / "data" / "spots.json"
HAUNTED_SPOTS_PATH = BASE_DIR / "data" / "haunted_spots.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS nuis (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    photo_url        TEXT,
    last_outing_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nui_id      INTEGER NOT NULL REFERENCES nuis(id) ON DELETE CASCADE,
    spot_id     TEXT,
    spot_name   TEXT NOT NULL,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    photo_url   TEXT,
    recommended INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_nui_id ON visits(nui_id);
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """1回の処理ごとに接続を開き、終わったら閉じる。"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """表と、写真を置くディレクトリを用意する。"""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


def reset_db() -> None:
    """デモの前に、データを空にして番号を1に戻す。"""
    init_db()
    with connect() as conn:
        conn.execute("DELETE FROM visits")
        conn.execute("DELETE FROM nuis")
        conn.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('nuis', 'visits')"
        )


def list_nuis() -> list[sqlite3.Row]:
    """登録した順に返す。"""
    with connect() as conn:
        return conn.execute("SELECT * FROM nuis ORDER BY id").fetchall()


def get_nui(nui_id: int) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM nuis WHERE id = ?", (nui_id,)
        ).fetchone()


def create_nui(
    name: str, last_outing_date: str, photo_url: str | None
) -> sqlite3.Row:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO nuis (name, photo_url, last_outing_date)
            VALUES (?, ?, ?)
            """,
            (name, photo_url, last_outing_date),
        )
        return conn.execute(
            "SELECT * FROM nuis WHERE id = ?", (cur.lastrowid,)
        ).fetchone()


def update_last_outing(nui_id: int, last_outing_date: str) -> sqlite3.Row:
    """最後に連れ出した日を変える。デモで放置した日数を増やすときに使う。"""
    with connect() as conn:
        conn.execute(
            "UPDATE nuis SET last_outing_date = ? WHERE id = ?",
            (last_outing_date, nui_id),
        )
        return conn.execute(
            "SELECT * FROM nuis WHERE id = ?", (nui_id,)
        ).fetchone()


def list_visits(nui_id: int) -> list[sqlite3.Row]:
    """そのぬいの訪問を、新しい順に返す。"""
    with connect() as conn:
        return conn.execute(
            """
            SELECT * FROM visits
            WHERE nui_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (nui_id,),
        ).fetchall()


def list_visits_for_grudge(nui_id: int) -> list[sqlite3.Row]:
    """怨念の計算に使う訪問。並び順は問わない。"""
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM visits WHERE nui_id = ?", (nui_id,)
        ).fetchall()


def create_visit(
    nui_id: int,
    spot_id: str | None,
    spot_name: str,
    lat: float,
    lng: float,
    photo_url: str | None,
    recommended: bool,
    created_at: str | None = None,
) -> sqlite3.Row:
    if created_at is None:
        created_at = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO visits
                (nui_id, spot_id, spot_name, lat, lng, photo_url,
                 recommended, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                nui_id,
                spot_id,
                spot_name,
                lat,
                lng,
                photo_url,
                1 if recommended else 0,
                created_at,
            ),
        )
        return conn.execute(
            "SELECT * FROM visits WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
