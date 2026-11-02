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

# 川崎市の周りの駅だけを使う（東京都や横浜市の駅も含む）
STATION_BOUNDS = {"lat": (35.45, 35.70), "lng": (139.40, 139.82)}
STATION_PASSENGERS_COLUMN = "S12_061"  # 2024年度の乗降客数

# あとから足すデータ（中間発表で配られるデータなど）。
# ファイルを data/raw/extra/ に置き、ここに1つ足すと、各地点の attrs[key] に値が入る。
#   mode="count"   : 地点から radius_m 以内にある点の数
#   mode="nearest" : いちばん近い点までの距離（m）
# CSV は lat_col と lng_col で緯度と経度の列を指定する（既定は「緯度」「経度」）。
# GeoJSON は点ならその座標、線や面なら頂点の平均を使う。
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


def load_points(path: Path, lat_col: str = "緯度", lng_col: str = "経度") -> pd.DataFrame:
    """CSV か GeoJSON から、点の緯度と経度（lat、lng の列）を読む。"""
    if path.suffix.lower() in (".geojson", ".json"):
        features = json.loads(path.read_text(encoding="utf-8"))["features"]
        rows = []
        for f in features:
            coords = np.array(_flatten_coords(f["geometry"]["coordinates"]))
            rows.append({"lng": coords[:, 0].mean(), "lat": coords[:, 1].mean()})
        return pd.DataFrame(rows)

    for encoding in ("utf-8-sig", "cp932"):
        try:
            df = pd.read_csv(path, encoding=encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"{path} の文字コードが分かりません")
    df = df[[lat_col, lng_col]].dropna().astype(float)
    return df.rename(columns={lat_col: "lat", lng_col: "lng"})


def _flatten_coords(coords) -> list[list[float]]:
    """GeoJSON の座標（点、線、面のどれでも）を [経度, 緯度] の並びにする。"""
    if isinstance(coords[0], (int, float)):
        return [coords[:2]]
    return [pt for c in coords for pt in _flatten_coords(c)]


def distances_to(lat: float, lng: float, points: pd.DataFrame) -> np.ndarray:
    """1つの地点から、たくさんの点までの直線距離（メートル）。"""
    p1 = np.radians(lat)
    p2 = np.radians(points["lat"].to_numpy())
    dl = np.radians(points["lng"].to_numpy() - lng)
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * 6371000 * np.arcsin(np.sqrt(h))


def attach_extra(spots: pd.DataFrame, source: dict, points: pd.DataFrame) -> pd.DataFrame:
    """EXTRA_SOURCES の1つ分の値を、spots の source["key"] の列に入れる。"""
    values = []
    for spot in spots.itertuples():
        d = distances_to(spot.lat, spot.lng, points)
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
        points = load_points(
            EXTRA_DIR / source["file"], source.get("lat_col", "緯度"), source.get("lng_col", "経度")
        )
        spots = attach_extra(spots, source, points)
        print(f"{source['file']} の {len(points)} 件から {source['key']} を足しました")
    extra_keys = [source["key"] for source in EXTRA_SOURCES]
    result = [to_spot(row, extra_keys) for row in spots.to_dict("records")]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = spots["category"].value_counts().to_dict()
    print(f"{OUTPUT} に {len(result)} 件を書き出しました: {counts}")


if __name__ == "__main__":
    main()
