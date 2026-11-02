"""API の入口。

    uvicorn app.main:app --reload --port 8000   （backend で実行）

今あるのは推薦の API だけ。ぬいと訪問の API、画面のファイルの配信はバックエンドB が足す。
"""

from contextlib import asynccontextmanager, closing

from fastapi import FastAPI, Query

from . import db
from .recommend import recommend


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="ぬい憑き API", lifespan=lifespan)


@app.get("/recommend")
def get_recommend(
    lat: float = Query(..., ge=-90, le=90, description="現在地の緯度"),
    lng: float = Query(..., ge=-180, le=180, description="現在地の経度"),
) -> list[dict]:
    with closing(db.connect()) as conn:
        spots = db.get_spots(conn)
    return recommend(spots, lat, lng)
