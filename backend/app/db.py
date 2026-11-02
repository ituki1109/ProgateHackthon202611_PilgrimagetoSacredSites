"""SQLite の読み書き。

推薦地点は backend/data/spots.json から spots 表に入れる。
起動のたびに spots.json の中身で入れ直すので、spots.json を作り直したら API を起動し直せばよい。
"""

import json
import os
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("NUITSUKI_DB", BACKEND_DIR / "nuitsuki.db"))
SPOTS_JSON = BACKEND_DIR / "data" / "spots.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS spots (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    lat                REAL NOT NULL,
    lng                REAL NOT NULL,
    category           TEXT NOT NULL,
    nearest_station    TEXT NOT NULL,
    station_distance_m INTEGER NOT NULL,
    station_passengers INTEGER NOT NULL,
    area_m2            INTEGER,
    park_type          TEXT
);
"""

ATTR_COLUMNS = ("nearest_station", "station_distance_m", "station_passengers", "area_m2", "park_type")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """表を作り、spots.json の推薦地点を入れ直す。"""
    with connect() as conn:
        conn.executescript(SCHEMA)
        load_spots(conn)
    conn.close()


def load_spots(conn: sqlite3.Connection, path: Path = SPOTS_JSON) -> int:
    spots = json.loads(path.read_text(encoding="utf-8"))
    conn.execute("DELETE FROM spots")
    conn.executemany(
        """
        INSERT INTO spots (id, name, lat, lng, category, nearest_station,
                           station_distance_m, station_passengers, area_m2, park_type)
        VALUES (:id, :name, :lat, :lng, :category, :nearest_station,
                :station_distance_m, :station_passengers, :area_m2, :park_type)
        """,
        [{**s, **s["attrs"]} for s in spots],
    )
    return len(spots)


def _to_spot(row: sqlite3.Row) -> dict:
    """表の1行を、docs/api.md の「spots.json の形」に戻す。"""
    return {
        "id": row["id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "category": row["category"],
        "attrs": {key: row[key] for key in ATTR_COLUMNS},
    }


def get_spots(conn: sqlite3.Connection) -> list[dict]:
    return [_to_spot(row) for row in conn.execute("SELECT * FROM spots ORDER BY id")]


def get_spot(conn: sqlite3.Connection, spot_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM spots WHERE id = ?", (spot_id,)).fetchone()
    return _to_spot(row) if row else None
