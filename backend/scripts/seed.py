"""デモ用のデータを入れる。

backend で `python scripts/seed.py` を実行する。
毎回データベースを空にしてから、ぬい3体と訪問の記録を入れる。
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import db  # noqa: E402
from app.grudge import calc_grudge  # noqa: E402


def main() -> None:
    today = date.today()
    db.reset_db()

    # (名前, 最後に連れ出した日は何日前か)
    # 怨念が「強い」「中くらい」「弱い」に分かれるようにする。
    nui_specs = [
        ("もちもち", 45),
        ("ふわまる", 60),
        ("こんぺいとう", 20),
    ]

    nuis = []
    for name, days_ago in nui_specs:
        last_outing_date = (today - timedelta(days=days_ago)).isoformat()
        nuis.append(db.create_nui(name, last_outing_date, photo_url=None))

    # (ぬいの番号, spot_id, 地点名, 緯度, 経度, 推薦地点か, 何日前か, 時, 分)
    visit_specs = [
        (0, "park_0798", "富士見公園", 35.529843, 139.710875, True, 7, 10, 40),
        (0, None, "近所のカフェ", 35.5325, 139.699, False, 3, 16, 5),
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
        ),
    ]

    for nui_index, spot_id, spot_name, lat, lng, recommended, days_ago, hour, minute in visit_specs:
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
            photo_url=None,
            recommended=recommended,
            created_at=created_at,
        )

    print("デモ用のデータを入れました。")
    for nui in db.list_nuis():
        visits = [dict(row) for row in db.list_visits_for_grudge(nui["id"])]
        grudge = calc_grudge(
            date.fromisoformat(nui["last_outing_date"]), visits, today
        )
        print(
            f"  id={nui['id']} {nui['name']} "
            f"最後に連れ出した日={nui['last_outing_date']} "
            f"怨念={grudge} 訪問={len(visits)}"
        )


if __name__ == "__main__":
    main()
