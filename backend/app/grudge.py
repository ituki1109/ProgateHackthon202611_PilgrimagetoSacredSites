"""ぬいに宿った怨念を計算する。

計算のしかたは docs/design.md の「怨念の計算」に合わせる。
画面では計算せず、API が返す値をそのまま使う。
"""

from __future__ import annotations

from datetime import date

# デモを見ながら調整する値。docs/design.md の「怨念の計算」と同じ。
GRUDGE_PER_DAY = 2
CALM_RECOMMENDED = 30
CALM_OTHER = 10


def _is_recommended(visit: dict) -> bool:
    """推薦地点での記録かどうか。recommended がなければ spot_id で判断する。"""
    if visit.get("recommended") is not None:
        return bool(visit["recommended"])
    return bool(visit.get("spot_id"))


def calc_grudge(last_outing_date: date, visits: list[dict], today: date) -> int:
    """0〜100 の怨念を返す。

    放置の点から、訪問で鎮めた点を引く。0 より小さくなれば 0 にする。
    today を引数で受けるので、日付を変えて確かめやすい。
    """
    days = max(0, (today - last_outing_date).days)
    grudge = min(100, days * GRUDGE_PER_DAY)

    for visit in visits:
        if _is_recommended(visit):
            grudge -= CALM_RECOMMENDED
        else:
            grudge -= CALM_OTHER

    return max(0, grudge)
