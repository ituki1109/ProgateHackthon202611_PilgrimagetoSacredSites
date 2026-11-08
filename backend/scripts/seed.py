"""デモ用のデータを入れる。

backend で `python scripts/seed.py` を実行する。
毎回データベースを空にしてから、ぬい3体と訪問の記録を入れる。
写真は scripts/demo_photos/ の画像を backend/uploads/ に写して使う。
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import db  # noqa: E402
from app.grudge import calc_grudge  # noqa: E402

DEMO_PHOTOS = Path(__file__).resolve().parent / "demo_photos"


def load_spots_by_id() -> dict:
    """推薦地点の位置を読む。距離による除霊量の減衰に使う。"""
    spots = []
    for path in (db.SPOTS_PATH, db.HAUNTED_SPOTS_PATH):
        if path.exists():
            with path.open(encoding="utf-8") as f:
                spots += json.load(f)
    return {spot["id"]: spot for spot in spots if "id" in spot}


def demo_photo(filename: str) -> str:
    """demo_photos/ の画像を uploads/ に写し、/uploads/... の URL を返す。"""
    db.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(DEMO_PHOTOS / filename, db.UPLOAD_DIR / f"demo_{filename}")
    return f"/uploads/demo_{filename}"


def main() -> None:
    today = date.today()
    db.reset_db()
    spots_by_id = load_spots_by_id()

    # (名前, 最後に連れ出した日は何日前か, 写真)
    # 怨念が「強い」「中くらい」「弱い」に分かれるようにする。
    # CALM_RECOMMENDED=50 に合わせ、デモの開始時は 40 / 100 / 10 になる。
    # 怨念 100 を超えるのは、デモの中で「放置する」を押したあと。
    nui_specs = [
        ("アブソル", 50, "abu.png"),
        ("ひろぬい", 50, "nui_fuwamaru.jpg"),
        ("コラプス", 30, "kora.png"),
    ]

    nuis = []
    for name, days_ago, photo in nui_specs:
        last_outing_date = (today - timedelta(days=days_ago)).isoformat()
        nuis.append(db.create_nui(name, last_outing_date, photo_url=demo_photo(photo)))

    # (ぬいの番号, spot_id, 地点名, 緯度, 経度, 推薦地点か, 何日前か, 時, 分, 写真)
    visit_specs = [
        (0, "park_0798", "富士見公園", 35.529843, 139.710875, True, 7, 10, 40, "abu.png"),
        (0, None, "近所のカフェ", 35.5325, 139.699, False, 3, 16, 5, "abu.png"),
        (
            2,
            "facility_141305000015",
            "ミューザ川崎シンフォニーホール",
            35.530981,
            139.694692,
            True,
            2,
            15,
            20,
            "kora.png",
        ),
    ]

    for nui_index, spot_id, spot_name, lat, lng, recommended, days_ago, hour, minute, photo in visit_specs:
        day = today - timedelta(days=days_ago)
        created_at = datetime(day.year, day.month, day.day, hour, minute).strftime(
            "%Y-%m-%dT%H:%M:%S"
        )
        db.create_visit(
            nui_id=nuis[nui_index]["id"],
            spot_id=spot_id,
            spot_name=spot_name,
            lat=lat,
            lng=lng,
            photo_url=demo_photo(photo),
            recommended=recommended,
            created_at=created_at,
        )

    print("デモ用のデータを入れました。")
    for nui in db.list_nuis():
        visits = [dict(row) for row in db.list_visits_for_grudge(nui["id"])]
        grudge = calc_grudge(
            date.fromisoformat(nui["last_outing_date"]),
            visits,
            today,
            spots_by_id,
        )
        print(
            f"  id={nui['id']} {nui['name']} "
            f"最後に連れ出した日={nui['last_outing_date']} "
            f"怨念={grudge} 訪問={len(visits)}"
        )


if __name__ == "__main__":
    main()
