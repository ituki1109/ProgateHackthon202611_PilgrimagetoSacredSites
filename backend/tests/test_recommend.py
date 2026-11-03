"""推薦の処理と、推薦地点を作る前処理を確かめる。

    python -m pytest tests   （backend で実行）
"""

import importlib.util
import json
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import db, main, recommend as rec
from app.recommend import distance_m, recommend

ROOT = Path(__file__).resolve().parents[2]
SPOTS = json.loads((ROOT / "backend" / "data" / "spots.json").read_text(encoding="utf-8"))

KAWASAKI_STATION = (35.531365, 139.69681)
MUSASHI_KOSUGI = (35.5763, 139.6595)


def load_prepare():
    spec = importlib.util.spec_from_file_location("prepare", ROOT / "data" / "prepare.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_spots_json():
    assert len(SPOTS) == 483
    assert {s["category"] for s in SPOTS} == {"公園・緑地", "文化・生涯学習"}
    assert all("facility_type" in s["attrs"] for s in SPOTS)
    # 仮設施設に移転した市民ミュージアムは入れない
    assert "川崎市市民ミュージアム" not in {s["name"] for s in SPOTS}


def test_spots_json_details():
    """施設には住所や時間などの詳細が入り、公園には開園した年が入る。"""
    keys = {"address", "phone", "hours", "hours_note", "description", "url", "opened_year", "amenities"}
    assert all(set(s["details"]) == keys for s in SPOTS)
    muza = next(s for s in SPOTS if s["name"] == "ミューザ川崎シンフォニーホール")["details"]
    assert muza["address"] == "神奈川県川崎市幸区大宮町1310"
    assert muza["hours"] == "9:00〜22:00"
    assert "バリアフリートイレ" in muza["amenities"]
    fujimi = next(s for s in SPOTS if s["name"] == "富士見公園")["details"]
    assert fujimi["opened_year"] == 1957 and isinstance(fujimi["opened_year"], int)
    assert fujimi["address"] is None and fujimi["amenities"] == []


def test_prepare_details_helpers():
    prepare = load_prepare()
    assert prepare._hours("9:00:00", "21:30:00") == "9:00〜21:30"
    assert prepare._hours("09:30", "19:00") == "9:30〜19:00"
    assert prepare._hours("", "19:00") is None
    assert prepare._year("2002") == 2002
    assert prepare._year("") is None
    row = pd.Series({"バリアフリートイレ": "有", "授乳室": "無", "車椅子可": "可（1F）", "スロープ、エレベータ、エスカレータ": "エレベータ有"})
    assert prepare._amenities(row) == ["車椅子で入れる", "スロープ・エレベーター", "バリアフリートイレ"]


def test_recommend_returns_details():
    result = recommend(SPOTS, *KAWASAKI_STATION)
    by_id = {s["id"]: s for s in SPOTS}
    for item in result:
        assert item["category"] == by_id[item["id"]]["category"]
        assert item["details"] == by_id[item["id"]]["details"]


def test_recommend_changes_with_location():
    near_kawasaki = recommend(SPOTS, *KAWASAKI_STATION)
    near_kosugi = recommend(SPOTS, *MUSASHI_KOSUGI)
    assert len(near_kawasaki) == 5
    assert [s["id"] for s in near_kawasaki] != [s["id"] for s in near_kosugi]
    assert near_kawasaki == recommend(SPOTS, *KAWASAKI_STATION)
    assert all(0 <= s["score"] <= 1 for s in near_kawasaki)


def test_recommend_skips_same_building():
    result = recommend(SPOTS, *KAWASAKI_STATION)
    for i, a in enumerate(result):
        for b in result[i + 1 :]:
            assert distance_m(a["lat"], a["lng"], b["lat"], b["lng"]) >= rec.SAME_PLACE_M


def test_recommend_mixes_categories():
    by_id = {s["id"]: s for s in SPOTS}
    for place in (KAWASAKI_STATION, MUSASHI_KOSUGI):
        categories = [by_id[r["id"]]["category"] for r in recommend(SPOTS, *place)]
        assert max(categories.count(c) for c in set(categories)) <= rec.MAX_PER_CATEGORY


def test_facility_reason_uses_type():
    result = recommend(SPOTS, *KAWASAKI_STATION)
    muza = next(r for r in result if r["name"] == "ミューザ川崎シンフォニーホール")
    assert muza["reason"] == "現在地から約200mと近い。音楽ホール。川崎駅から徒歩3分"


def test_reason_puts_main_factor_first():
    """点数を押し上げた要素から順に書き、広い公園には順位を書く。"""
    result = recommend(SPOTS, *MUSASHI_KOSUGI)
    tamagawa = next(r for r in result if r["name"] == "多摩川緑地")
    assert tamagawa["reason"].startswith("広さ72.1haの運動公園で、半径3km以内の公園で一番広い。")
    assert "現在地から約1.3km。" in tamagawa["reason"]


def test_attrs_change_result():
    base = recommend(SPOTS, *KAWASAKI_STATION)
    changed = [
        {**s, "attrs": {**s["attrs"], "station_distance_m": 5000}} if s["id"] == base[0]["id"] else s
        for s in SPOTS
    ]
    assert recommend(changed, *KAWASAKI_STATION)[0]["id"] != base[0]["id"]


def test_extra_rules(monkeypatch):
    """EXTRA_RULES に足した値が、点数と推薦理由に入る。"""
    base = recommend(SPOTS, *KAWASAKI_STATION)
    last = base[-1]["id"]
    spots = [{**s, "attrs": {**s["attrs"], "sample": 10 if s["id"] == last else 0}} for s in SPOTS]
    monkeypatch.setattr(
        rec, "EXTRA_RULES", {"sample": {"weight": 0.5, "full": 10, "reason": "近くに{value}件"}}
    )
    result = recommend(spots, *KAWASAKI_STATION)
    assert result[0]["id"] == last
    assert "近くに10件" in result[0]["reason"].split("。")
    assert all(0 <= r["score"] <= 1 for r in result)


def test_check_extra_rules():
    rec.check_extra_rules({"a": {"weight": 0.2, "full": 5}, "b": {"weight": 0.1, "full": -500}})
    with pytest.raises(ValueError):
        rec.check_extra_rules({"a": {"weight": 0.2, "full": 0}})
    with pytest.raises(ValueError):
        rec.check_extra_rules({"a": {"weight": -1, "full": 5}})


def test_prepare_extra_points(tmp_path):
    prepare = load_prepare()
    csv = tmp_path / "points.csv"
    csv.write_text("名前,緯度,経度\nA,35.5314,139.6968\nB,35.5320,139.6968\nC,35.6000,139.6000\n", encoding="utf-8")
    spots = pd.DataFrame([{"lat": 35.5314, "lng": 139.6968}])

    shapes = prepare.load_shapes(csv)
    assert shapes["count"] == 3
    counted = prepare.attach_extra(spots, {"key": "n", "mode": "count", "radius_m": 100}, shapes)
    assert counted["n"].tolist() == [2]


def _square(lng, lat, half):
    return [[[lng - half, lat - half], [lng + half, lat - half], [lng + half, lat + half], [lng - half, lat + half]]]


def test_prepare_extra_shapes(tmp_path):
    """面の中の地点は距離 0。座標のない地物は飛ばす。"""
    prepare = load_prepare()
    lng, lat = 139.6968, 35.5314
    features = [
        {"geometry": None},
        {"geometry": {"type": "Polygon", "coordinates": []}},
        # 地点を囲む、一辺 2km ほどの面。頂点はどれも地点から 1km 以上離れている
        {"geometry": {"type": "Polygon", "coordinates": _square(lng, lat, 0.01)}},
        # 地点から東へ約 900m の線
        {"geometry": {"type": "LineString", "coordinates": [[lng + 0.01, lat - 0.01], [lng + 0.01, lat + 0.01]]}},
        # 地点から北へ約 1.1km の点を含む集まり
        {"geometry": {"type": "GeometryCollection", "geometries": [{"type": "Point", "coordinates": [lng, lat + 0.01]}]}},
    ]
    path = tmp_path / "shapes.geojson"
    path.write_text(json.dumps({"features": features}), encoding="utf-8")
    shapes = prepare.load_shapes(path)
    assert shapes["count"] == 3

    spots = pd.DataFrame([{"lat": lat, "lng": lng}, {"lat": lat, "lng": lng + 0.05}])
    d = prepare.distances_to_shapes(lat, lng, shapes)
    assert d[0] == 0
    assert 850 < d[1] < 950
    assert 1050 < d[2] < 1150

    nearest = prepare.attach_extra(spots, {"key": "d", "mode": "nearest"}, shapes)
    assert nearest["d"].tolist()[0] == 0
    assert nearest["d"].tolist()[1] > 3000
    counted = prepare.attach_extra(spots, {"key": "n", "mode": "count", "radius_m": 500}, shapes)
    assert counted["n"].tolist() == [1, 0]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    with TestClient(main.app) as c:
        yield c


def test_recommend_api(client):
    res = client.get("/recommend", params={"lat": KAWASAKI_STATION[0], "lng": KAWASAKI_STATION[1]})
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 5
    assert set(body[0]) == {"id", "name", "lat", "lng", "score", "reason", "category", "attrs", "details"}
    assert body == sorted(body, key=lambda s: -s["score"])


def test_recommend_api_far_away_returns_empty(client):
    assert client.get("/recommend", params={"lat": 43.06, "lng": 141.35}).json() == []
