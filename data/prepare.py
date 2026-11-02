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

# 推薦地点にする公共施設の POIコード
FACILITY_POI_CODES = {"802", "803", "1012", "1016", "1305", "1512"}

# 川崎市の周りの駅だけを使う（東京都や横浜市の駅も含む）
STATION_BOUNDS = {"lat": (35.45, 35.70), "lng": (139.40, 139.82)}
STATION_PASSENGERS_COLUMN = "S12_061"  # 2024年度の乗降客数


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
            }
        )
    parks = pd.DataFrame(rows)
    keep = (parks["area_m2"] >= MIN_PARK_AREA_M2) & ~parks["name"].str.contains("霊園")
    return parks[keep]


def load_facilities() -> pd.DataFrame:
    df = pd.read_csv(raw_path("facility"), encoding="cp932", dtype=str)
    df = df[df["POIコード"].isin(FACILITY_POI_CODES) & df["緯度"].notna() & df["経度"].notna()]
    return pd.DataFrame(
        {
            "id": "facility_" + df["ID"].str.strip(),
            "name": df["名称"].str.strip(),
            "lat": df["緯度"].astype(float),
            "lng": df["経度"].astype(float),
            "category": "文化・生涯学習",
            "area_m2": None,
            "park_type": None,
        }
    )


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


def to_spot(row: dict) -> dict:
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
        },
    }


def main() -> None:
    spots = pd.concat([load_parks(), load_facilities()], ignore_index=True)
    spots = attach_nearest_station(spots, load_stations())
    result = [to_spot(row) for row in spots.to_dict("records")]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = spots["category"].value_counts().to_dict()
    print(f"{OUTPUT} に {len(result)} 件を書き出しました: {counts}")


if __name__ == "__main__":
    main()
