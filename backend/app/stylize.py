"""ぬいの登録写真を、Gemini でアイコン向けのキャラクターのイラストに変えます。

should の機能です。GEMINI_API_KEY が設定されていない、または呼び出しに
失敗したときは None を返します。呼び出す側（main.py）は、None なら
元の写真をそのまま使ってください（写真そのものが登録できなくなるのは避ける）。
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash-image:generateContent"
)

PROMPT = (
    "この写真に写っているぬいぐるみを、証明写真のように正面から撮り直した"
    "実写の写真にしてください。イラストやアニメ風には絶対にせず、"
    "本物の布やぬいぐるみの質感が分かる実写のままにしてください。"
    "ぬいぐるみの色・柄・形・素材感は変えないでください。"
    "ぬいぐるみを画面の中央に正面向きで配置し、顔（ある場合）がはっきり"
    "見えるようにしてください。"
    "背景は必ず単色の #6A4BF0（明るい紫）の布やスタジオ背景のようにし、"
    "証明写真らしい均一な光で照らしてください。模様や他の色は入れないこと。"
)

TIMEOUT_SECONDS = 20


def stylize_photo(image_bytes: bytes, mime_type: str) -> bytes | None:
    """写真のバイト列を渡すと、キャラクター化した画像のバイト列（PNG）を返します。

    GEMINI_API_KEY がない、通信に失敗した、Gemini が画像を返さなかった、
    のいずれでも None を返します（例外は投げません）。
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    body = json.dumps(
        {
            "contents": [
                {
                    "parts": [
                        {"text": PROMPT},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64.b64encode(image_bytes).decode("ascii"),
                            }
                        },
                    ]
                }
            ]
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            # URL の ?key= ではなくヘッダーで送る（アクセスログに残りにくくするため）。
            "x-goog-api-key": api_key,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            data = json.load(res)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"[stylize] Gemini の呼び出しに失敗しました: {exc}")
        return None

    try:
        parts = data["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError) as exc:
        print(f"[stylize] Gemini の返り値を読めませんでした: {exc} / {data}")
        return None

    for part in parts:
        inline = part.get("inline_data") or part.get("inlineData")
        if inline and inline.get("data"):
            return base64.b64decode(inline["data"])

    print("[stylize] Gemini が画像を返しませんでした（安全フィルターの可能性）。")
    return None
