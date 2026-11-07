"""デモ用のデータを入れる。

backend で `python scripts/seed.py` を実行する。
毎回データベースを空にしてから、ぬい3体と訪問の記録を入れる。
写真は scripts/demo_photos/ の仮のイラストを backend/uploads/ に写して使う。
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
    if not db.SPOTS_PATH.exists():
        return {}
    with db.SPOTS_PATH.open(encoding="utf-8") as f:
        spots = json.load(f)
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
    # CALM_RECOMMENDED=50 に合わせ、デモの開始時は 100 / 40 / 10 になる。
    nui_specs = [
        ("もちもち", 55, "nui_mochimochi.svg"),
        ("ふわまる", 60, "nui_fuwamaru.svg"),
        ("こんぺいとう", 30, "nui_konpeito.svg"),
    ]

    nuis = []
    for name, days_ago, photo in nui_specs:
        last_outing_date = (today - timedelta(days=days_ago)).isoformat()
        nuis.append(db.create_nui(name, last_outing_date, photo_url=demo_photo(photo)))

    # (ぬいの番号, spot_id, 地点名, 緯度, 経度, 推薦地点か, 何日前か, 時, 分, 写真)
    visit_specs = [
        (0, "park_0798", "富士見公園", 35.529843, 139.710875, True, 7, 10, 40, "visit_fujimi.svg"),
        (0, None, "近所のカフェ", 35.5325, 139.699, False, 3, 16, 5, "visit_cafe.svg"),
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
            "visit_muza.svg",
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
