"""怨念が 100 を超えたときの計算、推薦、記録の制限を確かめる。

    python -m pytest tests   （backend で実行）
"""

import importlib.util
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.grudge import calc_grudge, is_overflow
from app.recommend import HAUNTED_MAX_DISTANCE_M, distance_m, recommend_haunted

ROOT = Path(__file__).resolve().parents[2]
HAUNTED = json.loads((ROOT / "backend" / "data" / "haunted_spots.json").read_text(encoding="utf-8"))
KAWASAKI_STATION = (35.5314, 139.6968)
HERE = {"lat": KAWASAKI_STATION[0], "lng": KAWASAKI_STATION[1]}


def load_prepare_haunted():
    sys.path.insert(0, str(ROOT / "data"))
    spec = importlib.util.spec_from_file_location("prepare_haunted", ROOT / "data" / "prepare_haunted.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def client(tmp_path, monkeypatch):
    """本物の nuitsuki.db を使わず、空のデータベースで API を動かす。"""
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(db, "UPLOAD_DIR", tmp_path / "uploads")
    with TestClient(main.app) as test_client:
        yield test_client


def add_nui(client, days_ago):
    last = (date.today() - timedelta(days=days_ago)).isoformat()
    return client.post("/nuis", data={"name": "テスト", "last_outing_date": last}).json()


def test_grudge_goes_over_100_up_to_200():
    today = date(2026, 11, 8)
    assert calc_grudge(today - timedelta(days=50), [], today) == 100
    assert calc_grudge(today - timedelta(days=51), [], today) == 102
    assert calc_grudge(today - timedelta(days=365), [], today) == 200
    assert not is_overflow(100) and is_overflow(101)


def test_haunted_spots_json():
    assert {s["category"] for s in HAUNTED} == {"事故地点", "空き家の駅"}
    assert len({s["id"] for s in HAUNTED}) == len(HAUNTED)
    # 事故の番地は画面に出さない
    assert not any(ch.isdigit() for s in HAUNTED for ch in s["name"])
    assert all(s["details"]["address"] is None for s in HAUNTED)


def test_recommend_haunted_keeps_accidents_within_1km():
    picked = recommend_haunted(HAUNTED, *KAWASAKI_STATION)
    accidents = [s for s in picked if s["category"] == "事故地点"]
    expeditions = [s for s in picked if s["category"] == "空き家の駅"]
    assert len(accidents) == 5 and len(expeditions) == 2
    assert picked[:5] == accidents  # 遠征先は近場の後ろ
    assert all(distance_m(*KAWASAKI_STATION, s["lat"], s["lng"]) <= HAUNTED_MAX_DISTANCE_M for s in accidents)
    assert [s["name"] for s in expeditions] == ["春日駅の周辺", "駒込駅の周辺"]
    assert all("遠征先" in s["reason"] for s in expeditions)


def test_overflow_flow(client):
    nui = add_nui(client, 50)
    assert nui["grudge"] == 100
    normal = client.get("/recommend", params=HERE).json()
    assert {s["category"] for s in normal} <= {"公園・緑地", "文化・生涯学習"}

    # 放置すると 100 を超え、推薦地点が変わる
    neglected = client.post(f"/nuis/{nui['id']}/neglect").json()
    assert neglected["grudge"] == 200
    haunted = client.get("/recommend", params=HERE).json()
    assert {s["category"] for s in haunted} == {"事故地点", "空き家の駅"}

    # ふつうの地点と、推薦地点の外では記録できない
    for form in ({"spot_id": normal[0]["id"]}, {"spot_name": "カフェ"}):
        data = {"nui_id": nui["id"], **HERE, **form}
        assert client.post("/visits", data=data).status_code == 403
        assert client.get("/visits/preview", params=data).status_code == 403

    # 事故地点の近くなら記録でき、怨念が鎮まる
    spot = haunted[0]
    data = {"nui_id": nui["id"], "spot_id": spot["id"], "lat": spot["lat"], "lng": spot["lng"]}
    assert client.get("/visits/preview", params=data).json()["calm"]["amount"] == 50
    result = client.post("/visits", data=data).json()
    assert (result["grudge_before"], result["grudge_after"]) == (200, 150)
    assert result["visit"]["recommended"] is True


def test_calm_nui_can_record_at_normal_spot_during_overflow(client):
    """暴走していないぬいは、ほかのぬいが暴走していても、どこでも記録できる。"""
    calm = add_nui(client, 10)
    wild = add_nui(client, 50)
    client.post(f"/nuis/{wild['id']}/neglect")
    data = {"nui_id": calm["id"], "spot_name": "カフェ", **HERE}
    assert client.post("/visits", data=data).status_code == 201


def test_neglect_unknown_nui(client):
    assert client.post("/nuis/999/neglect").status_code == 404


def test_neglect_tells_when_grudge_cannot_pass_100(client):
    """上限 200 から除霊 100 を引くと 100 なので、暴走しないことを 409 で知らせる。"""
    nui = add_nui(client, 50)
    spots = client.get("/recommend", params=HERE).json()
    for spot in spots[:2]:
        data = {"nui_id": nui["id"], "spot_id": spot["id"], "lat": spot["lat"], "lng": spot["lng"]}
        client.post("/visits", data=data)

    response = client.post(f"/nuis/{nui['id']}/neglect")
    assert response.status_code == 409
    assert client.get("/nuis").json()[0]["last_outing_date"] == nui["last_outing_date"]


def test_town_name_hides_banchi():
    prepare = load_prepare_haunted()
    assert prepare.town_name("川崎市幸区堀川町７２（川崎西口）") == "幸区堀川町"
    assert prepare.town_name("神奈川県川崎市川崎区南町１７番地") == "川崎区南町"
    assert prepare.town_name("川崎市幸区南幸町南幸町３−９０") == "幸区南幸町"
    assert prepare.town_name("大田区矢口２−２８−１２") == "大田区矢口"


def test_filter_accidents():
    prepare = load_prepare_haunted()
    good = {
        "OCCURRENCE_DATE_AND_TIME": "2020/1/2 10:00",
        "ACCIDENT_TYPE_(CATEGORY)": "衝突",
        "ROAD_TYPE": "道路(その他)",
        "ACCIDENT_LOCATION": "車道",
        "NUMBER_OF_DEATHS": None,
        "DAMAGE_LEVEL": None,
        "LOCATION": "川崎市幸区堀川町７２",
        "LATITUDE": "35.53",
        "LONGITUDE": "139.69",
    }
    bad = [
        {"OCCURRENCE_DATE_AND_TIME": "2013/1/2 10:00"},
        {"ACCIDENT_TYPE_(CATEGORY)": "車両故障"},
        {"ROAD_TYPE": "道路(高速自動車国道)"},
        {"ACCIDENT_LOCATION": "バス停留所"},
        {"NUMBER_OF_DEATHS": "1"},
        {"DAMAGE_LEVEL": "死亡"},
        {"LOCATION": "川崎市幸区"},
        {"LATITUDE": "0"},
    ]
    rows = [good, good] + [{**good, **change} for change in bad]
    result = prepare.filter_accidents(pd.DataFrame(rows).astype(object))
    assert len(result) == 1  # 同じ事故の2行は1件にする
