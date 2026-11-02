"""現在地に合わせて推薦地点を選ぶ。

ルールは data/README.md の「推薦のルール（案）」。重みはデモを見ながら調整する。
"""

import math

WEIGHT_NEAR = 0.5  # 現在地からの近さ
WEIGHT_SIZE = 0.3  # 地点の大きさ
WEIGHT_STATION = 0.2  # 駅からの近さ

MAX_DISTANCE_M = 3000  # これより遠い地点は推薦しない
STATION_MAX_M = 2000  # 駅からこれ以上離れると、駅からの近さは 0
FACILITY_SIZE_SCORE = 0.7  # 施設には面積がないので、大きさは一律この値
WALK_M_PER_MIN = 80


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の直線距離（メートル）。"""
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def size_score(spot: dict) -> float:
    """公園は面積が 1,000㎡ で 0、100万㎡ で 1 になるよう対数で決める。"""
    area = spot["attrs"]["area_m2"]
    if not area:
        return FACILITY_SIZE_SCORE
    return min(1.0, max(0.0, (math.log10(area) - 3) / 3))


def make_reason(spot: dict) -> str:
    """データから分かる事実だけで推薦理由を書く。"""
    attrs = spot["attrs"]
    walk = math.ceil(attrs["station_distance_m"] / WALK_M_PER_MIN)
    access = f"{attrs['nearest_station']}駅から徒歩{walk}分"
    area = attrs["area_m2"]
    if area:
        size = f"{area / 10000:.1f}ha" if area >= 10000 else f"{area:,}㎡"
        return f"広さ{size}の{attrs['park_type']}。{access}"
    return f"{spot['category']}の施設。{access}"


def recommend(spots: list[dict], lat: float, lng: float, limit: int = 5) -> list[dict]:
    """現在地に近く、データの値から見て良い地点を、点数の高い順に返す。"""
    results = []
    for spot in spots:
        near = 1 - distance_m(lat, lng, spot["lat"], spot["lng"]) / MAX_DISTANCE_M
        if near <= 0:
            continue
        station = max(0.0, 1 - spot["attrs"]["station_distance_m"] / STATION_MAX_M)
        score = WEIGHT_NEAR * near + WEIGHT_SIZE * size_score(spot) + WEIGHT_STATION * station
        results.append(
            {
                "id": spot["id"],
                "name": spot["name"],
                "lat": spot["lat"],
                "lng": spot["lng"],
                "score": round(score, 2),
                "reason": make_reason(spot),
            }
        )
    # 同じ点数なら ID の順にして、毎回同じ結果を返す
    results.sort(key=lambda r: (-r["score"], r["id"]))
    return results[:limit]
