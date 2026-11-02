"""現在地に合わせて推薦地点を選ぶ。

ルールは data/README.md の「推薦のルール」。重みはデモを見ながら調整する。
"""

import math

WEIGHT_NEAR = 0.45  # 現在地からの近さ
WEIGHT_SIZE = 0.35  # 地点の大きさ（施設は種類）
WEIGHT_STATION = 0.2  # 駅からの近さ

MAX_DISTANCE_M = 3000  # これより遠い地点は推薦しない
STATION_MAX_M = 2000  # 駅からこれ以上離れると、駅からの近さは 0
WALK_M_PER_MIN = 80

# 施設には面積がないので、種類ごとに大きさの代わりの値を決める。
# 公園の値と比べると、0.9 は 50ha、0.6 は 6ha、0.3 は 8,000㎡ くらいの公園にあたる。
FACILITY_SCORES = {
    "博物館・美術館": 0.9,
    "記念館・資料館": 0.7,
    "音楽ホール": 0.7,
    "ホール": 0.6,
    "市民館・会館": 0.3,
    "図書館": 0.3,
}
FACILITY_DEFAULT_SCORE = 0.5

SAME_PLACE_M = 50  # これより近い地点は同じ建物とみなし、点数の高い方だけを返す
MAX_PER_CATEGORY = 3  # 1つのカテゴリから返すのはここまで（ほかのカテゴリが足りないときは超える）

# あとから足すデータ（data/prepare.py の EXTRA_SOURCES）を推薦に使うときの決まり。
# attrs のキーごとに、重み、点数が 1 になる値、推薦理由に足す文を書く。
# 例: {"example_count_500m": {"weight": 0.2, "full": 10, "reason": "半径500m以内に{value}件"}}
# full を負の値にすると、値が小さいほど点数が高くなる（0 で 1、-full で 0）。
EXTRA_RULES: dict[str, dict] = {}


def check_extra_rules(rules: dict[str, dict]) -> None:
    """EXTRA_RULES の書き間違いを、API の起動時に知らせる。"""
    for key, rule in rules.items():
        weight, full = rule.get("weight"), rule.get("full")
        if not isinstance(weight, (int, float)) or weight < 0:
            raise ValueError(f"EXTRA_RULES[{key!r}] の weight は 0 以上の数にする: {rule}")
        if not isinstance(full, (int, float)) or full == 0:
            raise ValueError(f"EXTRA_RULES[{key!r}] の full は 0 以外の数にする: {rule}")


check_extra_rules(EXTRA_RULES)


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の直線距離（メートル）。"""
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def size_score(spot: dict) -> float:
    """公園は面積が 1,000㎡ で 0、100万㎡ で 1 になるよう対数で決める。施設は種類で決める。"""
    attrs = spot["attrs"]
    area = attrs["area_m2"]
    if not area:
        return FACILITY_SCORES.get(attrs.get("facility_type"), FACILITY_DEFAULT_SCORE)
    return min(1.0, max(0.0, (math.log10(area) - 3) / 3))


def extra_score(value: float | None, full: float) -> float:
    """EXTRA_RULES の値を 0〜1 にする。"""
    if value is None:
        return 0.0
    if full < 0:
        return min(1.0, max(0.0, 1 - value / -full))
    return min(1.0, max(0.0, value / full))


def make_reason(spot: dict) -> str:
    """データから分かる事実だけで推薦理由を書く。"""
    attrs = spot["attrs"]
    walk = math.ceil(attrs["station_distance_m"] / WALK_M_PER_MIN)
    access = f"{attrs['nearest_station']}駅から徒歩{walk}分"
    area = attrs["area_m2"]
    if area:
        size = f"{area / 10000:.1f}ha" if area >= 10000 else f"{area:,}㎡"
        reason = f"広さ{size}の{attrs['park_type']}。{access}"
    else:
        reason = f"{attrs.get('facility_type') or spot['category'] + 'の施設'}。{access}"
    for key, rule in EXTRA_RULES.items():
        value = attrs.get(key)
        if rule.get("reason") and value is not None:
            reason += "。" + rule["reason"].format(value=value)
    return reason


def score_spot(spot: dict, lat: float, lng: float) -> float | None:
    """点数（0〜1）。MAX_DISTANCE_M より遠い地点は None。"""
    near = 1 - distance_m(lat, lng, spot["lat"], spot["lng"]) / MAX_DISTANCE_M
    if near <= 0:
        return None
    station = max(0.0, 1 - spot["attrs"]["station_distance_m"] / STATION_MAX_M)
    total = WEIGHT_NEAR * near + WEIGHT_SIZE * size_score(spot) + WEIGHT_STATION * station
    weights = WEIGHT_NEAR + WEIGHT_SIZE + WEIGHT_STATION
    for key, rule in EXTRA_RULES.items():
        total += rule["weight"] * extra_score(spot["attrs"].get(key), rule["full"])
        weights += rule["weight"]
    return total / weights


def recommend(spots: list[dict], lat: float, lng: float, limit: int = 5) -> list[dict]:
    """現在地に近く、データの値から見て良い地点を、点数の高い順に返す。"""
    scored = []
    for spot in spots:
        score = score_spot(spot, lat, lng)
        if score is not None:
            scored.append((round(score, 2), spot))
    # 同じ点数なら ID の順にして、毎回同じ結果を返す
    scored.sort(key=lambda item: (-item[0], item[1]["id"]))

    # 同じ建物の地点を除いてから、カテゴリが偏らないように選ぶ
    distinct = []
    for item in scored:
        spot = item[1]
        if all(distance_m(spot["lat"], spot["lng"], s["lat"], s["lng"]) >= SAME_PLACE_M for _, s in distinct):
            distinct.append(item)
        if len(distinct) >= limit * 4:
            break
    picked, counts = [], {}
    for item in distinct:
        category = item[1]["category"]
        if counts.get(category, 0) < MAX_PER_CATEGORY:
            picked.append(item)
            counts[category] = counts.get(category, 0) + 1
    picked += [item for item in distinct if item not in picked]
    picked = sorted(picked[:limit], key=lambda item: (-item[0], item[1]["id"]))

    return [
        {
            "id": spot["id"],
            "name": spot["name"],
            "lat": spot["lat"],
            "lng": spot["lng"],
            "score": score,
            "reason": make_reason(spot),
        }
        for score, spot in picked
    ]
