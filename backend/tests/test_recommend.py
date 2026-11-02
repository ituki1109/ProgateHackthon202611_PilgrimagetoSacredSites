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
    assert muza["reason"] == "音楽ホール。川崎駅から徒歩3分"


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
    assert result[0]["reason"].endswith("。近くに10件")
    assert all(0 <= r["score"] <= 1 for r in result)


def test_prepare_attach_extra(tmp_path):
    prepare = load_prepare()
    csv = tmp_path / "points.csv"
    csv.write_text("名前,緯度,経度\nA,35.5314,139.6968\nB,35.5320,139.6968\nC,35.6000,139.6000\n", encoding="utf-8")
    geojson = tmp_path / "areas.geojson"
    square = [[[139.696, 35.531], [139.697, 35.531], [139.697, 35.532], [139.696, 35.532]]]
    geojson.write_text(
        json.dumps({"features": [{"geometry": {"type": "Polygon", "coordinates": square}}]}), encoding="utf-8"
    )
    spots = pd.DataFrame([{"lat": 35.5314, "lng": 139.6968}])

    points = prepare.load_points(csv)
    counted = prepare.attach_extra(spots, {"key": "n", "mode": "count", "radius_m": 100}, points)
    assert counted["n"].tolist() == [2]

    areas = prepare.load_points(geojson)
    nearest = prepare.attach_extra(spots, {"key": "d", "mode": "nearest"}, areas)
    assert nearest["d"].tolist()[0] < 100


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
    assert set(body[0]) == {"id", "name", "lat", "lng", "score", "reason"}
    assert body == sorted(body, key=lambda s: -s["score"])


def test_recommend_api_far_away_returns_empty(client):
    assert client.get("/recommend", params={"lat": 43.06, "lng": 141.35}).json() == []
