from fastapi.testclient import TestClient

from app.main import app


def test_browser_must_check_frontend_files_before_reuse():
    client = TestClient(app)

    first = client.get("/")
    assert first.status_code == 200
    assert first.headers["cache-control"] == "no-cache"

    # 変わっていなければ、ファイルを送り直さずに済む
    again = client.get("/", headers={"If-None-Match": first.headers["etag"]})
    assert again.status_code == 304
    assert again.headers["cache-control"] == "no-cache"
