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
GRUDGE_MAX = 200  # 100日放置で上限になる
GRUDGE_OVERFLOW = 100  # これを超えると暴走し、推薦地点と記録できる場所が変わる
CALM_RECOMMENDED = 50
CALM_OTHER = 10

# 同じ場所に続けて記録したときの減少量と、減衰後の最低値。
REPEAT_DECAY = 10
CALM_MIN = 10

# 記録した位置と推薦地点の距離による減衰。
# 100m 以内は減衰なし、2km 以上は除霊なし、その間は直線で減る。
DISTANCE_FULL_M = 100
DISTANCE_ZERO_M = 2000


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


def _distance_detail(
    visit: dict, spots_by_id: dict | None
) -> tuple[int | None, float]:
    """推薦地点までの距離（m）と距離係数（0〜1）を返す。

    推薦地点以外の記録と、spots.json を渡していないときは減衰させない。
    距離が取れないときは distance_m を None にする。
    """
    if spots_by_id is None or not visit.get("spot_id"):
        return None, 1.0

    spot = spots_by_id.get(visit["spot_id"])
    if spot is None:
        # 地点の情報がないときは、推薦地点として扱わず鎮めない。
        return None, 0.0

    lat, lng = visit.get("lat"), visit.get("lng")
    if lat is None or lng is None:
        return None, 1.0

    distance = _distance_m(
        float(lat), float(lng), float(spot["lat"]), float(spot["lng"])
    )
    distance_m = int(distance + 0.5)
    if distance <= DISTANCE_FULL_M:
        return distance_m, 1.0
    if distance >= DISTANCE_ZERO_M:
        return distance_m, 0.0
    factor = 1 - (distance - DISTANCE_FULL_M) / (
        DISTANCE_ZERO_M - DISTANCE_FULL_M
    )
    return distance_m, factor


def _ordered(visits: list[dict]) -> list[dict]:
    """記録した順（古い順）に並べる。同じ日時なら id の順。"""
    return sorted(
        visits,
        key=lambda visit: (
            str(visit.get("created_at") or ""),
            int(visit.get("id") or 0),
        ),
    )


def _calm_of(
    visit: dict,
    previous_key: tuple | None,
    streak: int,
    spots_by_id: dict | None,
) -> dict:
    """直前までの記録を踏まえ、この記録の除霊量を返す。

    amount は呼び出し側で、残っている怨念に合わせて直す。
    """
    repeat_count = streak + 1 if _place_key(visit) == previous_key else 0
    base = CALM_RECOMMENDED if _is_recommended(visit) else CALM_OTHER
    repeat_penalty = REPEAT_DECAY * repeat_count
    before_distance = max(CALM_MIN, base - repeat_penalty)
    distance_m, distance_factor = _distance_detail(visit, spots_by_id)
    # 画面のモック（Math.round）と同じく、0.5 は切り上げる。
    computed = int(before_distance * distance_factor + 0.5)
    return {
        "amount": computed,
        "computed": computed,
        "base": base,
        "repeat_count": repeat_count,
        "repeat_penalty": repeat_penalty,
        "before_distance": before_distance,
        "distance_m": distance_m,
        "distance_factor": distance_factor,
        "capped": False,
    }


def _calc(
    last_outing_date: date,
    visits: list[dict],
    today: date,
    spots_by_id: dict | None = None,
) -> tuple[int, list[dict]]:
    """怨念と、記録1件ごとの除霊量を返す。"""
    days = max(0, (today - last_outing_date).days)
    grudge = min(GRUDGE_MAX, days * GRUDGE_PER_DAY)
    details: list[dict] = []

    previous_key = None
    streak = 0
    for visit in _ordered(visits):
        calm = _calm_of(visit, previous_key, streak, spots_by_id)
        applied = max(0, min(grudge, calm["computed"]))
        grudge -= applied
        calm["amount"] = applied
        calm["capped"] = applied < calm["computed"]
        details.append(calm)

        previous_key = _place_key(visit)
        streak = calm["repeat_count"]

    return max(0, grudge), details


def calc_grudge(
    last_outing_date: date,
    visits: list[dict],
    today: date,
    spots_by_id: dict | None = None,
) -> int:
    """0〜200 の怨念を返す。

    放置の点から、訪問で鎮めた点を引く。0 より小さくなれば 0 にする。
    today を引数で受けるので、日付を変えて確かめやすい。
    spots_by_id を渡すと、記録した位置と推薦地点の距離で除霊量を減らす。
    """
    return _calc(last_outing_date, visits, today, spots_by_id)[0]


def is_overflow(grudge: int) -> bool:
    """怨念が 100 を超えて、暴走しているかどうか。"""
    return grudge > GRUDGE_OVERFLOW


def _last_place(visits: list[dict]) -> tuple[tuple | None, int]:
    """いちばん新しい記録の場所キーと、その場所が何回続いているかを返す。"""
    previous_key = None
    streak = 0
    for visit in _ordered(visits):
        key = _place_key(visit)
        streak = streak + 1 if key == previous_key else 0
        previous_key = key
    return previous_key, streak


def calc_next_calm(
    last_outing_date: date,
    visits: list[dict],
    visit: dict,
    today: date,
    spots_by_id: dict | None = None,
) -> dict:
    """まだ保存していない記録1件の除霊量を返す。プレビュー用。

    返り値は grudge_before、grudge_after、calm。
    """
    before = calc_grudge(last_outing_date, visits, today, spots_by_id)
    previous_key, streak = _last_place(visits)
    calm = _calm_of(visit, previous_key, streak, spots_by_id)
    applied = max(0, min(before, calm["computed"]))
    calm["amount"] = applied
    calm["capped"] = applied < calm["computed"]
    return {
        "grudge_before": before,
        "grudge_after": before - applied,
        "calm": calm,
    }
