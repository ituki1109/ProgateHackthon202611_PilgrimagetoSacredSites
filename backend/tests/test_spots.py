"""推薦地点の表と推薦の API を確かめる。

    python -m pytest tests   （backend で実行）
"""

from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.recommend import recommend

KAWASAKI_STATION = (35.531365, 139.69681)
MUSASHI_KOSUGI = (35.5763, 139.6595)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    db.init_db()


def test_spots_are_loaded():
    with closing(db.connect()) as conn:
        spots = db.get_spots(conn)
    assert len(spots) == 484
    assert {s["category"] for s in spots} == {"公園・緑地", "文化・生涯学習"}


def test_get_spot_returns_attrs():
    with closing(db.connect()) as conn:
        spot = db.get_spot(conn, "park_0799")
    assert spot["name"] == "等々力緑地"
    assert spot["attrs"]["park_type"] == "総合公園"
    assert spot["attrs"]["area_m2"] == 365886


def test_recommend_changes_with_location():
    with closing(db.connect()) as conn:
        spots = db.get_spots(conn)
    near_kawasaki = recommend(spots, *KAWASAKI_STATION)
    near_kosugi = recommend(spots, *MUSASHI_KOSUGI)
    assert len(near_kawasaki) == 5
    assert [s["id"] for s in near_kawasaki] != [s["id"] for s in near_kosugi]
    assert near_kawasaki == recommend(spots, *KAWASAKI_STATION)


def test_recommend_api():
    with TestClient(app) as client:
        res = client.get("/recommend", params={"lat": KAWASAKI_STATION[0], "lng": KAWASAKI_STATION[1]})
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 5
    assert set(body[0]) == {"id", "name", "lat", "lng", "score", "reason"}
    assert body == sorted(body, key=lambda s: -s["score"])


def test_recommend_api_far_away_returns_empty():
    with TestClient(app) as client:
        res = client.get("/recommend", params={"lat": 43.06, "lng": 141.35})
    assert res.json() == []


def test_recommend_api_requires_location():
    with TestClient(app) as client:
        assert client.get("/recommend").status_code == 422
