"""オープンデータから推薦地点の一覧（backend/data/spots.json）を作る。

使うデータと作り方は data/README.md に書いてある。
元のデータは data/raw/ に置く。ないときはダウンロードする。

    python data/prepare.py
"""

import json
import math
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent
RAW_DIR = DATA_DIR / "raw"
OUTPUT = DATA_DIR.parent / "backend" / "data" / "spots.json"

SOURCES = {
    "plateau": (
        "14130_kawasaki-shi_2022_related.zip",
        "https://assets.cms.plateau.reearth.io/assets/45/fd2ad2-7098-4d01-85cc-107e0541afec/14130_kawasaki-shi_2022_related.zip",
    ),
    "facility": (
        "141305_public_facility.csv",
        "https://www.city.kawasaki.jp/170/cmsfiles/contents/0000116/116229/141305_public_facility.csv",
    ),
    "station": (
        "S12-25_GML.zip",
        "https://nlftp.mlit.go.jp/ksj/gml/data/S12/S12-25/S12-25_GML.zip",
    ),
}

PARK_GEOJSON = "14130_kawasaki-shi_city_2022_park.geojson"
STATION_GEOJSON = "S12-25_GML/UTF-8/S12-25_NumberOfPassengers.geojson"

# 公園種別コード（国土数値情報の都市公園と同じとみなす）
PARK_TYPES = {
    "1": "街区公園",
    "2": "近隣公園",
    "3": "地区公園",
    "4": "総合公園",
    "5": "運動公園",
    "9": "特殊公園",
    "11": "都市緑地",
    "12": "緑道",
    "13": "都市林",
}
MIN_PARK_AREA_M2 = 1000

# 推薦地点にする公共施設の POIコードと、施設の種類
FACILITY_TYPES = {
    "802": "博物館・美術館",
    "803": "記念館・資料館",
    "1012": "ホール",
    "1016": "音楽ホール",
    "1305": "市民館・会館",
    "1512": "図書館",
}

# 地点の詳細（details.amenities）に出す、公共施設一覧の設備の列と、画面に出す名前。
# 値が「有」「可」で始まるか「有」で終わる列だけを出す（「無」「否」や空は出さない）。
AMENITY_COLUMNS = {
    "車椅子可": "車椅子で入れる",
    "車椅子貸出": "車椅子の貸出",
    "スロープ、エレベータ、エスカレータ": "スロープ・エレベーター",
    "バリアフリートイレ": "バリアフリートイレ",
    "オストメイト対応トイレ": "オストメイト対応トイレ",
    "優先駐車場": "優先駐車場",
    "盲導犬・介助犬、聴導犬同伴": "補助犬と入れる",
    "筆談対応": "筆談できる",
    "授乳室": "授乳室",
    "おむつ替えコーナー": "おむつ替え",
    "ベビーカー利用": "ベビーカーで入れる",
    "ベビーカー貸出": "ベビーカーの貸出",
}

# 川崎市の周りの駅だけを使う（東京都や横浜市の駅も含む）
STATION_BOUNDS = {"lat": (35.45, 35.70), "lng": (139.40, 139.82)}
STATION_PASSENGERS_COLUMN = "S12_061"  # 2024年度の乗降客数

# あとから足すデータ（中間発表で配られるデータなど）。
# ファイルを data/raw/extra/ に置き、ここに1つ足すと、各地点の attrs[key] に値が入る。
#   mode="count"   : 地点から radius_m 以内にある地物（点、線、面）の数
#   mode="nearest" : いちばん近い地物までの距離（m）。面の中にある地点は 0
# CSV は lat_col と lng_col で緯度と経度の列を指定する（既定は「緯度」「経度」）。
# GeoJSON は点、線、面を形のまま扱う。座標のない地物は飛ばす。
# 推薦に使うときは、backend/app/recommend.py の EXTRA_RULES にも同じ key を足す。
EXTRA_DIR = RAW_DIR / "extra"
EXTRA_SOURCES: list[dict] = [
    # {"key": "example_count_500m", "file": "example.csv", "mode": "count", "radius_m": 500},
]


def raw_path(key: str) -> Path:
    """元のデータの置き場所を返す。なければダウンロードする。"""
    filename, url = SOURCES[key]
    path = RAW_DIR / filename
    if not path.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        print(f"ダウンロード: {filename}")
        urllib.request.urlretrieve(url, path)
    return path


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の直線距離（メートル）。"""
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def load_parks() -> pd.DataFrame:
    with zipfile.ZipFile(raw_path("plateau")) as z:
        features = json.loads(z.read(PARK_GEOJSON).decode("utf-8"))["features"]

    rows = []
    for i, f in enumerate(features, start=1):
        p = f["properties"]
        lng, lat = f["geometry"]["coordinates"][:2]
        rows.append(
            {
                # PLATEAU の公園には ID がないので、ファイルの並び順で番号を付ける
                "id": f"park_{i:04d}",
                "name": p["公園名"].strip(),
                "lat": lat,
                "lng": lng,
                "category": "公園・緑地",
                "area_m2": int(float(p["供用済面積"] or 0)),
                "park_type": PARK_TYPES.get(str(p["公園種別"]), "その他"),
                "opened_year": _year(p.get("供用開始年")),
            }
        )
    parks = pd.DataFrame(rows)
    keep = (parks["area_m2"] >= MIN_PARK_AREA_M2) & ~parks["name"].str.contains("霊園")
    return parks[keep]


def load_facilities() -> pd.DataFrame:
    df = pd.read_csv(raw_path("facility"), encoding="cp932", dtype=str)
    df = df[df["POIコード"].isin(FACILITY_TYPES) & df["緯度"].notna() & df["経度"].notna()]
    # 備考に「移転」とある施設（市民ミュージアム）は、座標の場所にもう施設がない
    df = df[~df["備考"].fillna("").str.contains("移転")]
    return pd.DataFrame(
        {
            "id": "facility_" + df["ID"].str.strip(),
            "name": df["名称"].str.strip(),
            "lat": df["緯度"].astype(float),
            "lng": df["経度"].astype(float),
            "category": "文化・生涯学習",
            "area_m2": None,
            "park_type": None,
            "facility_type": df["POIコード"].map(FACILITY_TYPES),
            "address": df["所在地_連結表記"].map(_text),
            "phone": df["電話番号"].map(_text),
            "hours": [_hours(a, b) for a, b in zip(df["開始時間"], df["終了時間"])],
            "hours_note": df["利用可能時間特記事項"].map(_text),
            "description": df["説明"].map(_text),
            "url": df["URL"].map(_text),
            "amenities": [_amenities(row) for _, row in df.iterrows()],
        }
    )


def _text(value) -> str | None:
    """前後の空白を除いた文字列。空なら None。"""
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _year(value) -> int | None:
    """「2002」のような年。年として読めなければ None。"""
    text = _text(value)
    return int(text) if text and text.isdigit() and 1800 <= int(text) <= 2100 else None


def _hours(start, end) -> str | None:
    """開始と終了の時間（9:00:00 や 09:30）を「9:00〜22:00」にする。"""
    times = []
    for value in (start, end):
        text = _text(value)
        if not text:
            return None
        hour, minute = text.split(":")[:2]
        times.append(f"{int(hour)}:{minute}")
    return "〜".join(times)


def _amenities(row: pd.Series) -> list[str]:
    """AMENITY_COLUMNS のうち、その施設にある設備の名前。"""
    names = []
    for column, name in AMENITY_COLUMNS.items():
        value = _text(row.get(column)) or ""
        if value.startswith(("有", "可")) or value.endswith("有"):
            names.append(name)
    return names


def load_stations() -> pd.DataFrame:
    with zipfile.ZipFile(raw_path("station")) as z:
        features = json.loads(z.read(STATION_GEOJSON).decode("utf-8"))["features"]

    rows = []
    for f in features:
        points = f["geometry"]["coordinates"]
        lat = sum(pt[1] for pt in points) / len(points)
        lng = sum(pt[0] for pt in points) / len(points)
        rows.append(
            {
                "name": f["properties"]["S12_001"],
                "lat": lat,
                "lng": lng,
                "passengers": f["properties"].get(STATION_PASSENGERS_COLUMN) or 0,
            }
        )
    df = pd.DataFrame(rows)
    (lat_min, lat_max), (lng_min, lng_max) = STATION_BOUNDS["lat"], STATION_BOUNDS["lng"]
    df = df[df["lat"].between(lat_min, lat_max) & df["lng"].between(lng_min, lng_max)]

    # 同じ駅が路線ごとに複数行あるので、駅名でまとめる
    return df.groupby("name", as_index=False).agg(
        lat=("lat", "mean"), lng=("lng", "mean"), passengers=("passengers", "sum")
    )


def attach_nearest_station(spots: pd.DataFrame, stations: pd.DataFrame) -> pd.DataFrame:
    station_list = stations.to_dict("records")
    nearest = []
    for spot in spots.itertuples():
        best = min(station_list, key=lambda s: distance_m(spot.lat, spot.lng, s["lat"], s["lng"]))
        nearest.append(
            {
                "nearest_station": best["name"],
                "station_distance_m": round(distance_m(spot.lat, spot.lng, best["lat"], best["lng"])),
                "station_passengers": int(best["passengers"]),
            }
        )
    return pd.concat([spots.reset_index(drop=True), pd.DataFrame(nearest)], axis=1)


def load_shapes(path: Path, lat_col: str = "緯度", lng_col: str = "経度") -> dict:
    """CSV の点か GeoJSON の地物を読み、線分の並びにする。

    点は長さ 0 の線分、線はそのまま、面は外周と穴の線分にする。
    返す dict の配列は、どれも線分の数だけの長さを持つ。
      ax, ay, bx, by : 線分の両端の経度と緯度
      feature        : どの地物の線分か（0 から数える）
      ring           : 面の縁の線分か（面の中にあるかを調べるのに使う）
    座標のない地物（geometry が null など）は飛ばす。
    """
    if path.suffix.lower() in (".geojson", ".json"):
        features = json.loads(path.read_text(encoding="utf-8"))["features"]
        geometries = [f.get("geometry") for f in features]
    else:
        geometries = [{"type": "Point", "coordinates": [lng, lat]} for lat, lng in _read_csv_points(path, lat_col, lng_col)]

    segments = []  # (ax, ay, bx, by, 地物の番号, 面の縁か)
    count = 0
    for geometry in geometries:
        parts = list(_geometry_parts(geometry))
        if not parts:
            continue
        for coords, kind in parts:
            if kind == "point":
                segments.append((*coords[0], *coords[0], count, False))
            else:
                for a, b in zip(coords, coords[1:]):
                    segments.append((*a, *b, count, kind == "ring"))
        count += 1

    arr = np.array(segments, dtype=float).reshape(-1, 6)
    return {
        "ax": arr[:, 0], "ay": arr[:, 1], "bx": arr[:, 2], "by": arr[:, 3],
        "feature": arr[:, 4].astype(int), "ring": arr[:, 5].astype(bool), "count": count,
    }


def _read_csv_points(path: Path, lat_col: str, lng_col: str) -> list[tuple[float, float]]:
    for encoding in ("utf-8-sig", "cp932"):
        try:
            df = pd.read_csv(path, encoding=encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"{path} の文字コードが分かりません")
    df = df[[lat_col, lng_col]].dropna().astype(float)
    return list(df.itertuples(index=False, name=None))


def _geometry_parts(geometry):
    """GeoJSON の geometry を、(座標の並び, "point" か "line" か "ring") に分ける。"""
    if not geometry:
        return
    kind = geometry.get("type")
    if kind == "GeometryCollection":
        for g in geometry.get("geometries") or []:
            yield from _geometry_parts(g)
        return
    coords = geometry.get("coordinates")
    if not coords:
        return
    if kind == "Point":
        yield [coords[:2]], "point"
    elif kind == "MultiPoint":
        for c in coords:
            yield [c[:2]], "point"
    elif kind == "LineString" and len(coords) >= 2:
        yield [c[:2] for c in coords], "line"
    elif kind == "MultiLineString":
        for line in coords:
            if len(line) >= 2:
                yield [c[:2] for c in line], "line"
    elif kind in ("Polygon", "MultiPolygon"):
        polygons = [coords] if kind == "Polygon" else coords
        for polygon in polygons:
            for ring in polygon:
                if len(ring) >= 3:
                    yield [c[:2] for c in ring] + [ring[0][:2]], "ring"


def distances_to_shapes(lat: float, lng: float, shapes: dict) -> np.ndarray:
    """1つの地点から各地物までの距離（メートル）。面の中にあれば 0。

    川崎市くらいの広さなら、地点のまわりを平面とみなしても誤差は小さい。
    """
    kx = 111320 * math.cos(math.radians(lat))
    ky = 110540
    ax, ay = (shapes["ax"] - lng) * kx, (shapes["ay"] - lat) * ky
    bx, by = (shapes["bx"] - lng) * kx, (shapes["by"] - lat) * ky
    dx, dy = bx - ax, by - ay

    # 原点（地点）から線分までの距離
    length2 = dx * dx + dy * dy
    with np.errstate(invalid="ignore", divide="ignore"):
        t = np.where(length2 > 0, -(ax * dx + ay * dy) / length2, 0.0)
    t = np.clip(t, 0.0, 1.0)
    d = np.hypot(ax + t * dx, ay + t * dy)
    result = np.full(shapes["count"], np.inf)
    np.minimum.at(result, shapes["feature"], d)

    # 原点から右へ伸ばした線が、面の縁と奇数回交われば面の中
    crosses = shapes["ring"] & ((ay > 0) != (by > 0))
    with np.errstate(invalid="ignore", divide="ignore"):
        x_at = ax + (0 - ay) * dx / np.where(dy == 0, 1, dy)
    crosses &= x_at > 0
    inside = np.bincount(shapes["feature"][crosses], minlength=shapes["count"]) % 2 == 1
    result[inside] = 0.0
    return result


def attach_extra(spots: pd.DataFrame, source: dict, shapes: dict) -> pd.DataFrame:
    """EXTRA_SOURCES の1つ分の値を、spots の source["key"] の列に入れる。"""
    values = []
    for spot in spots.itertuples():
        d = distances_to_shapes(spot.lat, spot.lng, shapes)
        if source["mode"] == "count":
            values.append(int((d <= source["radius_m"]).sum()))
        elif source["mode"] == "nearest":
            values.append(int(round(d.min())) if len(d) else None)
        else:
            raise ValueError(f"mode は count か nearest: {source}")
    return spots.assign(**{source["key"]: values})


def to_spot(row: dict, extra_keys: list[str] = ()) -> dict:
    """docs/api.md の「spots.json の形」にそろえる。"""
    area = row["area_m2"]
    return {
        "id": row["id"],
        "name": row["name"],
        "lat": round(row["lat"], 6),
        "lng": round(row["lng"], 6),
        "category": row["category"],
        "attrs": {
            "nearest_station": row["nearest_station"],
            "station_distance_m": int(row["station_distance_m"]),
            "station_passengers": int(row["station_passengers"]),
            "area_m2": None if pd.isna(area) else int(area),
            "park_type": None if pd.isna(row["park_type"]) else row["park_type"],
            "facility_type": None if pd.isna(row["facility_type"]) else row["facility_type"],
            **{key: _plain(row[key]) for key in extra_keys},
        },
        # 画面に出すだけの情報。推薦の点数には使わない
        "details": {
            "address": _plain(row.get("address")),
            "phone": _plain(row.get("phone")),
            "hours": _plain(row.get("hours")),
            "hours_note": _plain(row.get("hours_note")),
            "description": _plain(row.get("description")),
            "url": _plain(row.get("url")),
            # 施設と並べると列が小数になるので、整数に戻す
            "opened_year": None if pd.isna(row.get("opened_year")) else int(row["opened_year"]),
            "amenities": row["amenities"] if isinstance(row.get("amenities"), list) else [],
        },
    }


def _plain(value):
    """pandas の値を JSON に書ける形にする。"""
    if value is None or pd.isna(value):
        return None
    return value.item() if hasattr(value, "item") else value


def main() -> None:
    spots = pd.concat([load_parks(), load_facilities()], ignore_index=True)
    spots = attach_nearest_station(spots, load_stations())
    for source in EXTRA_SOURCES:
        shapes = load_shapes(
            EXTRA_DIR / source["file"], source.get("lat_col", "緯度"), source.get("lng_col", "経度")
        )
        spots = attach_extra(spots, source, shapes)
        print(f"{source['file']} の {shapes['count']} 件から {source['key']} を足しました")
    extra_keys = [source["key"] for source in EXTRA_SOURCES]
    result = [to_spot(row, extra_keys) for row in spots.to_dict("records")]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = spots["category"].value_counts().to_dict()
    print(f"{OUTPUT} に {len(result)} 件を書き出しました: {counts}")


if __name__ == "__main__":
    main()
