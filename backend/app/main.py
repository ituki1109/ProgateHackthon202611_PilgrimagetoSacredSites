"""ぬい憑きの API。

uvicorn app.main:app --reload --port 8000 で起動する。
frontend/ を / で、backend/uploads/ を /uploads で配る。
"""

from __future__ import annotations

import json
import math
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import db
from .grudge import calc_grudge

try:
    # バックエンドA が作る推薦の処理。まだない間は仮の処理を使う。
    from .recommend import recommend as recommend_spots
except ImportError:
    recommend_spots = None

FRONTEND_DIR = db.BASE_DIR.parent / "frontend"

# 起動時に spots.json から読み込む。
SPOTS: list[dict[str, Any]] = []
SPOTS_BY_ID: dict[str, dict[str, Any]] = {}


def load_spots() -> list[dict[str, Any]]:
    """backend/data/spots.json を読む。まだなければ空の一覧にする。"""
    if not db.SPOTS_PATH.exists():
        return []
    try:
        with db.SPOTS_PATH.open(encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"spots.json を読めませんでした: {exc}")
        return []
    return data if isinstance(data, list) else []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global SPOTS, SPOTS_BY_ID
    db.init_db()
    SPOTS = load_spots()
    SPOTS_BY_ID = {
        spot["id"]: spot for spot in SPOTS if isinstance(spot, dict) and "id" in spot
    }
    yield


app = FastAPI(title="ぬい憑き API", lifespan=lifespan)

# 仮の JSON で作っている画面（localhost:5500）から呼ぶときだけ許可する。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _save_photo(photo: UploadFile | None, prefix: str) -> str | None:
    """写真を backend/uploads/ に保存し、/uploads/... の URL を返す。"""
    if photo is None or not photo.filename:
        return None

    suffix = Path(photo.filename).suffix.lower()
    if not suffix[1:].isalnum() or len(suffix) > 10:
        suffix = ".jpg"

    filename = f"{prefix}_{uuid.uuid4().hex}{suffix}"
    db.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with (db.UPLOAD_DIR / filename).open("wb") as out:
        shutil.copyfileobj(photo.file, out)
    return f"/uploads/{filename}"


def _grudge_of(nui: Any) -> int:
    visits = [dict(row) for row in db.list_visits_for_grudge(nui["id"])]
    return calc_grudge(
        date.fromisoformat(nui["last_outing_date"]),
        visits,
        date.today(),
        SPOTS_BY_ID,
    )


def _nui_to_dict(nui: Any) -> dict[str, Any]:
    visits = db.list_visits_for_grudge(nui["id"])
    return {
        "id": nui["id"],
        "name": nui["name"],
        "photo_url": nui["photo_url"],
        "last_outing_date": nui["last_outing_date"],
        "grudge": calc_grudge(
            date.fromisoformat(nui["last_outing_date"]),
            [dict(row) for row in visits],
            date.today(),
            SPOTS_BY_ID,
        ),
        "visit_count": len(visits),
    }


def _visit_to_dict(visit: Any) -> dict[str, Any]:
    return {
        "id": visit["id"],
        "nui_id": visit["nui_id"],
        "spot_id": visit["spot_id"],
        "spot_name": visit["spot_name"],
        "lat": visit["lat"],
        "lng": visit["lng"],
        "photo_url": visit["photo_url"],
        "recommended": bool(visit["recommended"]),
        "created_at": visit["created_at"],
    }


def _fallback_reason(spot: dict[str, Any]) -> str:
    """推薦の処理ができるまでの仮の理由。データにある事実だけを書く。"""
    category = spot.get("category") or "地点"
    attrs = spot.get("attrs") or {}
    station = attrs.get("nearest_station")
    distance = attrs.get("station_distance_m")
    if station and isinstance(distance, (int, float)):
        minutes = math.ceil(distance / 80)
        return f"{category}の地点。{station}駅から徒歩{minutes}分"
    return f"{category}の地点。"


def _fallback_recommend(lat: float, lng: float, limit: int = 5) -> list[dict]:
    """recommend.py ができるまでの仮の推薦。spots.json の先頭から返す。"""
    return [
        {
            "id": spot["id"],
            "name": spot["name"],
            "lat": spot["lat"],
            "lng": spot["lng"],
            "score": 0.5,
            "reason": _fallback_reason(spot),
        }
        for spot in SPOTS[:limit]
    ]


@app.get("/nuis")
def get_nuis():
    """ぬいの一覧を、登録した順に返す。"""
    return [_nui_to_dict(nui) for nui in db.list_nuis()]


@app.post("/nuis", status_code=201)
def create_nui(
    name: str = Form(...),
    last_outing_date: date = Form(...),
    photo: UploadFile | None = File(None),
):
    """ぬいを登録する。写真は任意。"""
    name = name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")

    photo_url = _save_photo(photo, "nui")
    nui = db.create_nui(name, last_outing_date.isoformat(), photo_url)
    return _nui_to_dict(nui)


@app.get("/recommend")
def get_recommend(lat: float, lng: float):
    """現在地に合わせた推薦地点を、点数の高い順に5件返す。"""
    if not SPOTS:
        return []
    if recommend_spots is not None:
        return recommend_spots(SPOTS, lat, lng, limit=5)
    return _fallback_recommend(lat, lng, limit=5)


@app.post("/visits", status_code=201)
def create_visit(
    nui_id: int = Form(...),
    spot_id: str | None = Form(None),
    spot_name: str | None = Form(None),
    lat: float = Form(...),
    lng: float = Form(...),
    photo: UploadFile | None = File(None),
):
    """訪問を記録し、記録の前後の怨念を返す。"""
    nui = db.get_nui(nui_id)
    if nui is None:
        raise HTTPException(status_code=404, detail="nui not found")

    spot_id = (spot_id or "").strip() or None
    spot_name = (spot_name or "").strip() or None

    recommended = False
    if spot_id is not None:
        spot = SPOTS_BY_ID.get(spot_id)
        if spot is None:
            raise HTTPException(status_code=404, detail="spot not found")
        spot_name = spot["name"]
        recommended = True
    elif not spot_name:
        raise HTTPException(
            status_code=422,
            detail="spot_name is required when spot_id is not given",
        )

    grudge_before = _grudge_of(nui)
    photo_url = _save_photo(photo, "visit")
    visit = db.create_visit(
        nui_id=nui_id,
        spot_id=spot_id,
        spot_name=spot_name,
        lat=lat,
        lng=lng,
        photo_url=photo_url,
        recommended=recommended,
    )
    grudge_after = _grudge_of(nui)

    return {
        "visit": _visit_to_dict(visit),
        "grudge_before": grudge_before,
        "grudge_after": grudge_after,
    }


@app.get("/nuis/{nui_id}/visits")
def get_nui_visits(nui_id: int):
    """そのぬいの訪問の記録を、新しい順に返す。"""
    if db.get_nui(nui_id) is None:
        raise HTTPException(status_code=404, detail="nui not found")
    return [_visit_to_dict(visit) for visit in db.list_visits(nui_id)]


class FrontendFiles(StaticFiles):
    """画面のファイルを配る。

    指定がないとブラウザーは古い JS を使い回し、新しい JS と混ざると画面が止まる。
    no-cache で、使う前に毎回、変わっていないかをサーバーに確かめさせる。
    """

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


# 写真と画面を配る。API のルートを先に登録してから、最後に / へ置く。
db.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(db.UPLOAD_DIR)), name="uploads")

if FRONTEND_DIR.is_dir():
    app.mount("/", FrontendFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:

    @app.get("/")
    def frontend_not_ready():
        return {"detail": "frontend is not ready"}
