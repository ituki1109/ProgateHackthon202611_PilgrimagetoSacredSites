"""ぬいに宿った怨念を計算する。

計算のしかたは docs/design.md の「怨念の計算」に合わせる。
画面では計算せず、API が返す値をそのまま使う。
除霊の量は、同じ場所に続けて記録した回数と、記録した位置から
推薦地点までの距離で減る。値は保存せず、API が返すたびに計算する。
"""

from __future__ import annotations

import math
from datetime import date

# デモを見ながら調整する値。docs/design.md の「怨念の計算」と同じ。
GRUDGE_PER_DAY = 2
CALM_RECOMMENDED = 50
CALM_OTHER = 10

# 同じ場所に続けて記録したときの減少量と、減衰後の最低値。
REPEAT_DECAY = 10
CALM_MIN = 10

# 記録した位置と推薦地点の距離による減衰。
# 300m 以内は減衰なし、3km 以上は除霊なし、その間は直線で減る。
DISTANCE_FULL_M = 300
DISTANCE_ZERO_M = 3000


def _is_recommended(visit: dict) -> bool:
    """推薦地点での記録かどうか。recommended がなければ spot_id で判断する。"""
    if visit.get("recommended") is not None:
        return bool(visit["recommended"])
    return bool(visit.get("spot_id"))


def _place_key(visit: dict) -> tuple:
    """同じ場所かどうかを見るためのキー。

    推薦地点は spot_id、それ以外は画面で入れた地点名を使う。
    """
    spot_id = visit.get("spot_id")
    if spot_id:
        return ("spot", spot_id)
    return ("other", (visit.get("spot_name") or "").strip())


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の直線距離（メートル）。"""
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _distance_factor(visit: dict, spots_by_id: dict | None) -> float:
    """記録した位置が推薦地点にどれだけ近いか（0〜1）。

    推薦地点以外の記録と、spots.json を渡していないときは減衰させない。
    """
    if spots_by_id is None or not visit.get("spot_id"):
        return 1.0

    spot = spots_by_id.get(visit["spot_id"])
    if spot is None:
        return 0.0

    lat, lng = visit.get("lat"), visit.get("lng")
    if lat is None or lng is None:
        return 1.0

    distance = _distance_m(
        float(lat), float(lng), float(spot["lat"]), float(spot["lng"])
    )
    if distance <= DISTANCE_FULL_M:
        return 1.0
    if distance >= DISTANCE_ZERO_M:
        return 0.0
    return 1 - (distance - DISTANCE_FULL_M) / (DISTANCE_ZERO_M - DISTANCE_FULL_M)


def _ordered(visits: list[dict]) -> list[dict]:
    """記録した順（古い順）に並べる。同じ日時なら id の順。"""
    return sorted(
        visits,
        key=lambda visit: (
            str(visit.get("created_at") or ""),
            int(visit.get("id") or 0),
        ),
    )


def calc_grudge(
    last_outing_date: date,
    visits: list[dict],
    today: date,
    spots_by_id: dict | None = None,
) -> int:
    """0〜100 の怨念を返す。

    放置の点から、訪問で鎮めた点を引く。0 より小さくなれば 0 にする。
    today を引数で受けるので、日付を変えて確かめやすい。
    spots_by_id を渡すと、記録した位置と推薦地点の距離で除霊量を減らす。
    """
    days = max(0, (today - last_outing_date).days)
    grudge = min(100, days * GRUDGE_PER_DAY)

    previous_key = None
    streak = 0
    for visit in _ordered(visits):
        key = _place_key(visit)
        if key == previous_key:
            streak += 1
        else:
            streak = 0

        base = CALM_RECOMMENDED if _is_recommended(visit) else CALM_OTHER
        calm = max(CALM_MIN, base - REPEAT_DECAY * streak)
        calm *= _distance_factor(visit, spots_by_id)
        # 画面のモック（Math.round）と同じく、0.5 は切り上げる。
        grudge -= int(calm + 0.5)

        previous_key = key

    return max(0, grudge)
