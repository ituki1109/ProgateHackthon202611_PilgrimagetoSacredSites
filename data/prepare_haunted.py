"""Project LINKS のデータから、怨念が 100 を超えたときの地点（backend/data/haunted_spots.json）を作る。

使うデータと作り方は data/README.md の「怨念が 100 を超えたときの地点」に書いてある。
元のデータは data/raw/ に置く。ないときはダウンロードする。

    python data/prepare_haunted.py
"""

import json
import re
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

from prepare import RAW_DIR, STATION_BOUNDS, STATION_GEOJSON, STATION_PASSENGERS_COLUMN
from prepare import attach_nearest_station, distance_m, load_stations, raw_path

OUTPUT = Path(__file__).resolve().parent.parent / "backend" / "data" / "haunted_spots.json"

SOURCES = {
    "accident": (
        "02_jikohoukokusyo.csv",
        "https://www.geospatial.jp/ckan/dataset/34f1fd46-04d0-4a6a-9136-f4deb259b246/resource/d009e4d4-8062-4c00-b176-3efa480a7d44/download/02_jikohoukokusyo.csv",
    ),
    "akiya": (
        "01_tourokubukken.csv",
        "https://www.geospatial.jp/ckan/dataset/da1b7c8d-164f-4fdd-977b-3c49c7396c08/resource/d1cbba16-4972-4bab-bcf5-e275b26a18de/download/01_tourokubukken.csv",
    ),
}

# 事故地点にする事故。古い記録は道路が変わっていることがあるので、直近の10年に絞る
ACCIDENT_YEARS = (2014, 2023)
ACCIDENT_TYPES = {"衝突", "死傷"}  # 車両故障や車内の事故は、その場所の危なさを表さない
ACCIDENT_ROAD_TYPE = "道路(その他)"  # 高速道路は歩いて行けない
ACCIDENT_PLACES = {"車道", "交差点", "横断歩道", "路肩", "路側帯"}
CELL_DECIMALS = 3  # この桁で丸めた緯度経度（約100m四方）を、同じ地点として数える

# 空き家の駅は、川崎市から日帰りで行ける都県の物件だけを使う
AKIYA_PREFECTURES = {"神奈川県", "東京都", "千葉県", "埼玉県"}
ORIGIN = (35.5314, 139.6968)  # 川崎駅。同じ名前の駅があるときは、ここに近いほうを選ぶ
AKIYA_MAX_KM = 150

ACCIDENT_NOTE = (
    "自動車運送事業者の事故報告書から、2014〜2023年に一般道で起きた事故の位置を選びました。"
    "番地と事故の内容は出していません。車道には入らず、歩道から写真を撮ってください。"
)
AKIYA_NOTE = (
    "全国版空き家・空き地バンクの登録物件のサンプル（2025年3月31日時点）で、最寄り駅がこの駅の物件があります。"
    "物件の場所はデータにないので、駅の周りを歩きます。人の敷地には入らないでください。"
)


def haunted_raw_path(key: str) -> Path:
    """元のデータの置き場所を返す。なければダウンロードする。"""
    filename, url = SOURCES[key]
    path = RAW_DIR / filename
    if not path.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        print(f"ダウンロード: {filename}")
        urllib.request.urlretrieve(url, path)
    return path


def town_name(location: str) -> str:
    """住所から「幸区堀川町」のように町名までを取り出す。番地は画面に出さない。"""
    text = unicodedata.normalize("NFKC", location).strip()
    text = re.sub(r"^(神奈川県|東京都)", "", text)
    text = re.sub(r"^[^\d区市]+市", "", text)
    match = re.match(r"([^\d区]+区)?([^\d\s(]*)", text)
    ward, town = match.group(1) or "", match.group(2)
    # 「南幸町南幸町」のように同じ町名が続けて書かれた記録を直す
    half = len(town) // 2
    if len(town) % 2 == 0 and town[:half] == town[half:]:
        town = town[:half]
    return ward + town


def filter_accidents(df: pd.DataFrame) -> pd.DataFrame:
    """事故地点にする行を選ぶ。死者数は空欄が多いので、死亡の記録がある行だけを除く。"""
    year = pd.to_numeric(df["OCCURRENCE_DATE_AND_TIME"].str.slice(0, 4), errors="coerce")
    lat = pd.to_numeric(df["LATITUDE"], errors="coerce")
    lng = pd.to_numeric(df["LONGITUDE"], errors="coerce")
    deaths = pd.to_numeric(df["NUMBER_OF_DEATHS"], errors="coerce").fillna(0)
    location = df["LOCATION"].fillna("").map(lambda text: unicodedata.normalize("NFKC", text))
    (lat_min, lat_max), (lng_min, lng_max) = STATION_BOUNDS["lat"], STATION_BOUNDS["lng"]
    keep = (
        year.between(*ACCIDENT_YEARS)
        & df["ACCIDENT_TYPE_(CATEGORY)"].isin(ACCIDENT_TYPES)
        & (df["ROAD_TYPE"] == ACCIDENT_ROAD_TYPE)
        & df["ACCIDENT_LOCATION"].isin(ACCIDENT_PLACES)
        & (deaths == 0)
        & (df["DAMAGE_LEVEL"] != "死亡")
        & location.str.contains(r"\d")  # 番地のない記録は、座標が町の代表点になる
        & lat.between(lat_min, lat_max)
        & lng.between(lng_min, lng_max)
    )
    # 1つの事故が車両ごとに複数行あるので、日時と場所が同じ行は1件にする
    result = df[keep].assign(lat=lat, lng=lng, year=year.astype("Int64"))
    return result.drop_duplicates(["OCCURRENCE_DATE_AND_TIME", "LOCATION"])


def accident_cells(df: pd.DataFrame) -> pd.DataFrame:
    """約100m四方ごとに件数をまとめ、地点にする。"""
    rows = []
    cells = df.groupby([df["lat"].round(CELL_DECIMALS), df["lng"].round(CELL_DECIMALS)], sort=True)
    for i, (_, group) in enumerate(cells, start=1):
        rows.append(
            {
                "id": f"accident_{i:04d}",
                "name": f"{town_name(group['LOCATION'].iloc[0])}付近の事故地点",
                "lat": round(float(group["lat"].mean()), 6),
                "lng": round(float(group["lng"].mean()), 6),
                "accident_count": len(group),
            }
        )
    return pd.DataFrame(rows)


def load_accidents() -> list[dict]:
    df = pd.read_csv(haunted_raw_path("accident"), encoding="utf-8-sig", dtype=str)
    cells = attach_nearest_station(accident_cells(filter_accidents(df)), load_stations())
    return [
        haunted_spot(row, "事故地点", {"accident_count": row["accident_count"]}, ACCIDENT_NOTE)
        for row in cells.to_dict("records")
    ]


def load_all_stations() -> dict[str, list[dict]]:
    """全国の駅を、駅名ごとの候補の一覧にする（路線ごとに1行ある）。"""
    with zipfile.ZipFile(raw_path("station")) as z:
        features = json.loads(z.read(STATION_GEOJSON).decode("utf-8"))["features"]
    stations: dict[str, list[dict]] = {}
    for f in features:
        points = f["geometry"]["coordinates"]
        props = f["properties"]
        stations.setdefault(props["S12_001"], []).append(
            {
                "lat": sum(pt[1] for pt in points) / len(points),
                "lng": sum(pt[0] for pt in points) / len(points),
                "line": f"{props.get('S12_002') or ''} {props.get('S12_003') or ''}",
                "passengers": props.get(STATION_PASSENGERS_COLUMN) or 0,
            }
        )
    return stations


def pick_station(name: str, line: str, stations: dict[str, list[dict]]) -> dict | None:
    """物件の駅名と路線名に合う駅を選ぶ。物件の路線名と合う候補があれば、その中から選ぶ。"""
    candidates = stations.get(name, [])
    # 「都営三田線」と「三田線」のように書き方が違うので、「線」の前の2文字で比べる
    key = re.sub(r"線$", "", line or "")[-2:]
    matched = [c for c in candidates if key and key in c["line"]]
    pool = matched or candidates
    if not pool:
        return None
    best = min(pool, key=lambda c: distance_m(*ORIGIN, c["lat"], c["lng"]))
    return best if distance_m(*ORIGIN, best["lat"], best["lng"]) <= AKIYA_MAX_KM * 1000 else None


def load_akiya_stations() -> list[dict]:
    df = pd.read_csv(haunted_raw_path("akiya"), encoding="utf-8-sig", dtype=str)
    df = df[df["PREFECTURE"].isin(AKIYA_PREFECTURES) & df["NEAREST_STATION"].notna()]
    stations = load_all_stations()

    spots = []
    groups = df.groupby(["NEAREST_STATION", "NEAREST_TRAIN_LINE"], sort=True)
    for (name, line), group in groups:
        station = pick_station(name, line, stations)
        if station is None:
            continue
        row = {
            "id": f"akiya_station_{len(spots) + 1:04d}",
            "name": f"{name}駅の周辺",
            "lat": round(station["lat"], 6),
            "lng": round(station["lng"], 6),
            "nearest_station": name,
            "station_distance_m": 0,
            "station_passengers": int(station["passengers"]),
        }
        attrs = {
            "akiya_count": len(group),
            "akiya_cities": sorted(group["CITY"].unique()),
            "akiya_line": line,
        }
        spots.append(haunted_spot(row, "空き家の駅", attrs, AKIYA_NOTE))
    return spots


def haunted_spot(row: dict, category: str, extra: dict, note: str) -> dict:
    """docs/api.md の「spots.json の形」にそろえ、extra を attrs に足す。"""
    return {
        "id": row["id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "category": category,
        "attrs": {
            "nearest_station": row["nearest_station"],
            "station_distance_m": int(row["station_distance_m"]),
            "station_passengers": int(row["station_passengers"]),
            "area_m2": None,
            "park_type": None,
            "facility_type": None,
            **extra,
        },
        "details": {
            "address": None,
            "phone": None,
            "hours": None,
            "hours_note": None,
            "description": note,
            "url": None,
            "opened_year": None,
            "amenities": [],
        },
    }


def main() -> None:
    accidents = load_accidents()
    akiya = load_akiya_stations()
    result = accidents + akiya
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUTPUT} に事故地点 {len(accidents)} 件、空き家の駅 {len(akiya)} 件を書き出しました")


if __name__ == "__main__":
    main()
