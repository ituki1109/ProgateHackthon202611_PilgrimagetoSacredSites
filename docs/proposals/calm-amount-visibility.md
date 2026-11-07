# 除霊量をユーザーに見せる変更案

> このファイルは Issue に貼るための変更案です。承認後にコードと既存のドキュメントを直します。

## Issue 用サマリ

- **現状**: 記録後の結果画面に「30 鎮まりました」と文章で出るだけで、記録前にはどれだけ鎮まるか分かりません。また、怨念が少ないときは `grudge_before - grudge_after` が実際の除霊量より小さく表示されます。
- **提案**: `POST /visits` の返り値に除霊量の内訳（`calm`）を追加し、`GET /visits/preview` で記録前の見積もりを返します。記録前の画面に「この記録の除霊量 25」、結果画面に「除霊量 25」と内訳を出します。
- **理由**: 同じ場所の連続減衰と距離減衰をユーザーが数値で理解でき、遠くで記録しても鎮まらない理由が分かります。実際に地点まで足を運ぶ動機になります。
- **影響**: API は追加のみで、既存の項目は変えません。画面は表示の追加です。モックも同じ形に同期します。`frontend/css/style.css` と `frontend/index.html` は変更せず、既存のクラス（`.stats`、`.result-grudge`、`.result-diff`）を使います。
- **見積もり**: 半日程度（API・画面・モック・ドキュメント）。

---

## 1. 調査結果

### 1.1 いまの表示

| 場所 | いまの表示 | 除霊量が見えるか |
|---|---|---|
| 地図の推薦カード | 推薦理由、地点名 | 見えない |
| 記録前の画面（`#visit`） | 「ここで記録すると、怨念が多く鎮まります。同じ場所に続けて記録すると鎮まる量は減り、地点から離れているとさらに減ります。」 | 数値では見えない |
| 記録後の画面（`#visit-result`） | 「25 鎮まりました。」と怨念の before → after | 文章の中で見える |
| API | `visit`、`grudge_before`、`grudge_after` | 除霊量そのものは返していない |
| モック | 同じ | 同じ |

- 結果画面の数値は `frontend/js/visit.js` の `renderResult()` が `before - after` で計算しています。
- `POST /visits` は `backend/app/main.py` の `create_visit()` で、記録の前後の怨念だけを返しています。
- `backend/app/grudge.py` の `calc_grudge()` は合計の怨念だけを返し、1回ごとの除霊量は外に出していません。

### 1.2 課題

1. **記録前に分からない。** 距離減衰と連続減衰を入れたのに、記録するまで何点鎮まるか分かりません。
2. **減衰の理由が分からない。** 「同じ場所の2回目だから10減った」「1.3km離れているから64%になった」という内訳が出ていません。
3. **怨念が少ないときに過小表示になる。** 例: 怨念10のぬいが推薦地点（除霊量50）で記録すると、画面は「10 鎮まりました」になります。実際は50の力があり、怨念が10しか残っていないだけです。
4. **「除霊量」と「実際に減った怨念」が区別されていない。** ユーザーには同じに見えますが、内訳を出すには分ける必要があります。

---

## 2. 提案する仕様（A案）

### 2.1 記録前の画面

`#visit` のぬいを選ぶ欄の下に、選んだぬいと地点での除霊量を出します。

```text
┌ 推薦された地点 ──────────────────────┐
│ ミューザ川崎シンフォニーホール          │
│ ここで記録すると、怨念が多く鎮まります。 │
└───────────────────────────────────────┘

連れてきたぬい
  [ふわまる]  怨念 82
  [もちもち]  怨念 40

┌ この記録の除霊量 ────────────────────┐
│              25                       │
│ 基本 50 − 同じ場所 2回目 10 = 40       │
│ 距離 1.3km のため 64%                 │
└───────────────────────────────────────┘
```

- ぬいを変えると取り直します。
- 怨念が足りないときは「怨念が残り20のため、20鎮まります」と出します。
- 3km以上離れているときは「3km以上離れているため、鎮まりません」と出します。
- 推薦地点以外は「基本 10（距離の減衰なし）」と出します。
- 取得に失敗しても記録は止めず、除霊量の欄だけ隠します。

### 2.2 記録後の画面

```text
怨念  82 → 57

除霊量  25

基本 50 − 同じ場所 2回目 10 = 40
距離 1.3km のため 64%
40 × 64% = 25
```

- 大きい数字で「除霊量 25」を出します。
- その下に内訳を小さく出します。
- `amount < computed` のときは「怨念が残り20だったため、20鎮まりました」と補足します。
- `calm` がない古い API のときは、いままでどおり `before - after` を出します。

### 2.3 API の形

#### `POST /visits` の返り値に `calm` を追加

既存の `visit`、`grudge_before`、`grudge_after` は変えません。

```json
{
  "visit": { "id": 5, "...": "Visit の形" },
  "grudge_before": 82,
  "grudge_after": 57,
  "calm": {
    "amount": 25,
    "computed": 25,
    "base": 50,
    "repeat_count": 1,
    "repeat_penalty": 10,
    "before_distance": 40,
    "distance_m": 1285,
    "distance_factor": 0.6352,
    "capped": false
  }
}
```

| 項目 | 型 | 内容 |
|---|---|---|
| `calm.amount` | 整数 | 実際に怨念が減った量（`grudge_before - grudge_after`） |
| `calm.computed` | 整数 | 距離係数まで反映した除霊量。怨念の残りで制限する前 |
| `calm.base` | 整数 | 50（推薦地点）または 10（それ以外） |
| `calm.repeat_count` | 整数 | 同じ場所に続けて記録した回数。初回は 0、2回目は 1 |
| `calm.repeat_penalty` | 整数 | `repeat_count × 10` |
| `calm.before_distance` | 整数 | `max(10, base - repeat_penalty)`。距離係数を掛ける前の値 |
| `calm.distance_m` | 整数か null | 推薦地点までの距離（m）。推薦地点以外は null |
| `calm.distance_factor` | 小数（0〜1） | 距離係数。推薦地点以外は 1 |
| `calm.capped` | 真偽値 | `amount < computed` のとき true。怨念が足りなかった |

- `computed` は `int(before_distance * distance_factor + 0.5)` で、画面のモックと同じ切り上げです。
- `amount` は `min(grudge_before, computed)` です。
- 例: 怨念20で `computed` が25なら、`amount` は20、`capped` は true。

#### `GET /visits/preview` を追加

記録する前に、同じ計算を保存せずに返します。

```text
GET /visits/preview?nui_id=2&spot_id=park_0798&lat=35.529843&lng=139.710875
```

- `nui_id`、`lat`、`lng` は必須です。
- `spot_id` か `spot_name` のどちらかが必要です（`POST /visits` と同じ）。
- バリデーションと 404 / 422 の返し方は `POST /visits` と同じにします。
- 訪問の記録、写真の保存、データベースの更新はしません。

```json
{
  "grudge_before": 82,
  "grudge_after": 57,
  "calm": {
    "amount": 25,
    "computed": 25,
    "base": 50,
    "repeat_count": 1,
    "repeat_penalty": 10,
    "before_distance": 40,
    "distance_m": 1285,
    "distance_factor": 0.6352,
    "capped": false
  }
}
```

### 2.4 バックエンドの変更案

#### `backend/app/grudge.py`

1回ごとの除霊量を返す内部関数を足し、既存の `calc_grudge()` の返り値は変えません。

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Calm:
    amount: int
    computed: int
    base: int
    repeat_count: int
    repeat_penalty: int
    before_distance: int
    distance_m: int | None
    distance_factor: float
    capped: bool


def _distance_detail(visit: dict, spots_by_id: dict | None) -> tuple[int | None, float]:
    """距離（m）と距離係数（0〜1）を返す。推薦地点以外は (None, 1.0)。"""
    ...


def _calm_of(visit: dict, previous_key, streak: int, spots_by_id) -> dict:
    """直前までの記録を踏まえ、この記録の除霊量を返す。"""
    repeat_count = streak + 1 if _place_key(visit) == previous_key else 0
    base = CALM_RECOMMENDED if _is_recommended(visit) else CALM_OTHER
    repeat_penalty = REPEAT_DECAY * repeat_count
    before_distance = max(CALM_MIN, base - repeat_penalty)
    distance_m, factor = _distance_detail(visit, spots_by_id)
    computed = int(before_distance * factor + 0.5)
    return {
        "amount": computed,  # 呼び出し側で怨念の残りに合わせて直す
        "computed": computed,
        "base": base,
        "repeat_count": repeat_count,
        "repeat_penalty": repeat_penalty,
        "before_distance": before_distance,
        "distance_m": distance_m,
        "distance_factor": factor,
        "capped": False,
    }


def _calc(last_outing_date, visits, today, spots_by_id):
    """怨念と、記録1件ごとの除霊量を返す。"""
    grudge = min(100, max(0, (today - last_outing_date).days) * GRUDGE_PER_DAY)
    details = []
    previous_key = None
    streak = 0
    for visit in _ordered(visits):
        calm = _calm_of(visit, previous_key, streak, spots_by_id)
        applied = min(grudge, calm["computed"])
        grudge -= applied
        calm["amount"] = applied
        calm["capped"] = applied < calm["computed"]
        details.append(calm)
        previous_key = _place_key(visit)
        streak = calm["repeat_count"]
    return max(0, grudge), details


def calc_grudge(last_outing_date, visits, today, spots_by_id=None) -> int:
    """既存の呼び出しはそのまま。合計の怨念だけを返す。"""
    return _calc(last_outing_date, visits, today, spots_by_id)[0]


def calc_next_calm(last_outing_date, visits, visit, today, spots_by_id=None) -> dict:
    """まだ保存していない記録1件の除霊量を返す。プレビュー用。"""
    before = calc_grudge(last_outing_date, visits, today, spots_by_id)
    previous_key, streak = _last_place(visits)
    calm = _calm_of(visit, previous_key, streak, spots_by_id)
    applied = min(before, calm["computed"])
    calm["amount"] = applied
    calm["capped"] = applied < calm["computed"]
    return {
        "grudge_before": before,
        "grudge_after": before - applied,
        "calm": calm,
    }
```

`_last_place(visits)` は、いちばん新しい記録の場所キーと、その場所が何回続いているかを返します。`calc_grudge()` のループと同じ数え方にします。

#### `backend/app/main.py`

- `POST /visits` の検証を `_visit_target()` のような関数にまとめ、`GET /visits/preview` と共有します。
- `POST /visits` では、記録を作る前に `calc_next_calm()` で内訳を作り、記録後に `amount` を `grudge_before - grudge_after` で確定します。
- `GET /visits/preview` は `calc_next_calm()` の結果をそのまま返します。

```python
@app.get("/visits/preview")
def preview_visit(
    nui_id: int,
    lat: float,
    lng: float,
    spot_id: str | None = None,
    spot_name: str | None = None,
):
    """記録する前の除霊量を返す。保存はしない。"""
    nui = db.get_nui(nui_id)
    if nui is None:
        raise HTTPException(status_code=404, detail="nui not found")

    spot_id, spot_name, recommended = _visit_target(spot_id, spot_name)
    visits = [dict(row) for row in db.list_visits_for_grudge(nui_id)]
    visit = {
        "spot_id": spot_id,
        "spot_name": spot_name,
        "lat": lat,
        "lng": lng,
        "recommended": recommended,
    }
    return calc_next_calm(
        date.fromisoformat(nui["last_outing_date"]),
        visits,
        visit,
        date.today(),
        SPOTS_BY_ID,
    )
```

`POST /visits` の返り値は、既存の3項目に `calm` を足すだけです。

### 2.5 フロントエンドの変更案

#### `frontend/index.html`（変更しない）

`#visit-calm` は `visit.js` が作ります。`index.html` は触りません。

```js
function calmBox() {
  let box = document.getElementById('visit-calm');
  if (!box) {
    box = document.createElement('div');
    box.id = 'visit-calm';
    box.setAttribute('aria-live', 'polite');
    document.getElementById('visit-nui').closest('fieldset').appendChild(box);
  }
  return box;
}
```

`spot-detail.js` が `dialog` を動的に作っているのと同じやり方です。HTML の変更を減らせるので、フロントB の変更ともぶつかりません。

#### `frontend/js/api.js`

```js
// GET /visits/preview — 記録する前の除霊量（保存しない）
export async function getCalmPreview({ nuiId, spotId, spotName, lat, lng }) {
  if (USE_MOCK) return getMockCalmPreview({ nuiId, spotId, spotName, lat, lng });
  const query = new URLSearchParams({ nui_id: String(nuiId), lat: String(lat), lng: String(lng) });
  if (spotId) query.set('spot_id', spotId);
  else query.set('spot_name', spotName);
  return getJson(`${API_BASE}/visits/preview?${query}`);
}
```

- モック用に `getMockCalmPreview()` を足し、`mockVisit()` の返り値にも `calm` を入れます。
- モックの計算は、いまの `calcMockGrudge()` を「合計」と「1件ごとの内訳」の両方を返す形に分けます。

#### `frontend/js/visit.js`

- `let calmPreview = null;` で最新のプレビューを持つ。
- `showVisit()` で `renderNuiOptions()` のあとに `refreshCalmPreview()` を呼ぶ。
- `renderNuiOptions()` の `group.onchange` で、選択を付け直したあとに `refreshCalmPreview()` を呼ぶ。
- `refreshCalmPreview()` は、選ばれているぬいと `place` から `getCalmPreview()` を呼び、`calmBox()` に出す。
- 推薦地点以外で地点名を入力したときも、`input` か `change` で `refreshCalmPreview()` を呼ぶ。名前が空の間は「地点の名前を入れると除霊量が出ます」と出す。
- `renderResult()` は、`result.calm` があれば `amount` と内訳を出す。なければいままでどおり `before - after` を出す。

```js
async function refreshCalmPreview() {
  const box = calmBox();
  const checked = document.querySelector('#visit-nui input[name="nui_id"]:checked');
  if (!checked || !place) {
    box.replaceChildren();
    return;
  }

  box.textContent = '除霊量を計算しています…';
  try {
    const data = await getCalmPreview({
      nuiId: checked.value,
      spotId: place.spot ? place.spot.id : null,
      spotName: place.spot ? null : document.getElementById('visit-spot-name')?.value.trim(),
      lat: place.lat,
      lng: place.lng,
    });
    renderCalmPreview(box, data);
  } catch (err) {
    console.error('[visit] 除霊量を取れませんでした:', err);
    box.replaceChildren();
  }
}
```

#### `frontend/css/style.css`（変更しない）

調査したところ、**新しい CSS を足さずに既存のクラスだけで作れます**。`style.css` は触りません。

| 用途 | 使う既存クラス | 使い方 |
|---|---|---|
| 記録前の除霊量カード | `.stats`、`.stats dt`、`.stats dd` | 3列の小さな数値カード。`nuis.js` のプロフィールと同じ形 |
| 記録前の補足 | `.field-note` | 距離・連続・上限の説明 |
| 記録後の大きい「除霊量」 | `.result-grudge`、`.result-label`、`.result-to` | いまの「怨念 82 → 57」と同じ行の形 |
| 記録後の内訳 | `.result-diff` | いまの「25 鎮まりました」と同じ文字スタイル |
| 地点カード | `.place-card`、`.place-badge`、`.place-name`、`.place-note` | いまのまま。除霊量はその下に足す |

たとえば、記録前はこう作ります。

```js
function renderCalmPreview(box, data) {
  const { calm } = data;

  const stats = document.createElement('dl');
  stats.className = 'stats';
  for (const [term, value] of [
    ['除霊量', String(calm.amount)],
    ['基本', String(calm.base)],
    ['距離', calm.distance_m == null ? '—' : distanceText(calm.distance_m)],
  ]) {
    const item = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    item.append(dt, dd);
    stats.appendChild(item);
  }

  const note = document.createElement('p');
  note.className = 'field-note';
  note.textContent = calmNote(calm);

  box.replaceChildren(stats, note);
}
```

記録後は、いまの「怨念」の行の下に同じ形の行を足します。

```js
const calmRow = document.createElement('p');
calmRow.className = 'result-grudge';

const calmLabel = document.createElement('span');
calmLabel.className = 'result-label';
calmLabel.textContent = '除霊量';

const calmValue = document.createElement('span');
calmValue.className = 'result-to';
calmValue.textContent = String(calm.amount);

calmRow.append(calmLabel, calmValue);
```

- `.stats` は3列固定なので、除霊量・基本・距離の3つに使います。連続の減点は `.field-note` か `.result-diff` の文で出します。
- `.result-to` は52pxの大きい数字です。記録後の怨念の数字と並ぶので、除霊量が目立ちます。大きすぎる場合は、記録前と同じ `.stats` に置き換えられます。どちらも既存クラスです。
- 新しいクラス名（`.calm-preview` など）は作りません。CSS の追加・変更がないので、他の開発者の調整と衝突しません。

### 2.6 モックの変更案

- `frontend/js/api.js` の `MOCK_GRUDGE` はそのまま使います。
- `calcMockGrudge()` を、合計と内訳を返す `calcMockCalm()` に分けます。
- `getMockNuis()` は合計だけ使います。
- `getMockCalmPreview()` と `mockVisit()` は内訳も返します。
- `frontend/mock/nuis.json` の値は変えません。

### 2.7 ドキュメントの変更案

| ファイル | 直すところ |
|---|---|
| `docs/api.md` | `POST /visits` の `calm`、`GET /visits/preview` を追加 |
| `docs/design.md` | 「怨念の計算」の下に「除霊量の見せ方」を追加 |
| `docs/overview.md` | 結果画面とデモ手順に「除霊量 25」を追加 |
| `docs/tasks/backend-api.md` | preview と `calm` の実装仕様を追加 |
| `docs/tasks/frontend-main.md` | 記録前のプレビューと結果画面の内訳を追加 |

### 2.8 確認すること

- [ ] `calc_grudge()` の既存の返り値が変わらない。
- [ ] 同じ場所の2回目で `repeat_count=1`、`before_distance=40` になる。
- [ ] 1.3km の推薦地点で `distance_m` が約1285、`distance_factor` が約0.64 になる。
- [ ] 3km以上で `computed=0`、`amount=0` になる。
- [ ] 怨念20で `computed=25` のとき、`amount=20`、`capped=true` になる。
- [ ] `GET /visits/preview` で訪問の記録が増えない。
- [ ] モックとバックエンドで同じ値になる。
- [ ] `USE_MOCK` は `false` のまま。
- [ ] `frontend/css/style.css` と `frontend/index.html` を変更していない。

---

## 3. 代替案

### B案: 結果画面の内訳だけ

- `POST /visits` に `calm` を足し、結果画面に「除霊量 25」と内訳を出す。
- プレビューは作らない。
- A案より小さいが、記録する前にどれだけ鎮まるかは分からない。

### C案: フロントだけで差分を強調

- `before - after` を大きなバッジにするだけ。API は変えない。
- いちばん小さいが、距離・連続の内訳は出せない。
- 怨念が少ないときに過小表示になる問題も残る。
- デモ直前で時間がないときの保険。

---

## 4. 推奨

**A案**を推奨します。

距離減衰は「実際に足を運ばせる」ために入れた機能です。記録前に「ここなら25、3km以上なら0」と見えると、ユーザーが地点を選ぶ理由になります。API は追加だけで、既存の画面とデータは壊れません。

---

## 5. 実装順序

1. `docs/api.md` に `calm` と `GET /visits/preview` を追記し、API の形を先に固定する。
2. `backend/app/grudge.py` に内訳の計算を足す。`calc_grudge()` の返り値は変えない。
3. `backend/app/main.py` に preview と `POST /visits` の `calm` を足す。
4. `frontend/js/api.js` のモックを同じ形に同期する。
5. `frontend/js/visit.js` に記録前・結果画面の表示を足す。`frontend/css/style.css` と `frontend/index.html` は変更しない。
6. `docs/*.md` と `README.md` を更新する。
7. 手動で 300m以内、1.3km、3km以上、2回目、怨念が少ないときを確認する。

---

## 6. 未決事項

- 画面の言葉は「除霊量」でよいか。「鎮まった量」の方がやさしいかもしれない。
- 内訳は常に出すか、「詳しく」で折りたたむか。デモでは常に出す方が説明しやすい。
- 距離の表示は、1km未満は m、1km以上は km にする想定でよいか。
- `calm` をトップレベルに置くか、`visit` の中に入れるか。案は既存の `grudge_before` / `grudge_after` と並べるトップレベル。
