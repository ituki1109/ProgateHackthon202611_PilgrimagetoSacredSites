# 除霊量の表示位置を変える変更案（案1確定版）

> このファイルは Issue に貼るための変更案です。承認後にコードと既存のドキュメントを直します。  
> 採用：**案1（推薦地点のカード内に表示）**。案2（マップ円表示）は今回は見送ります。  
> 距離減衰の定数は `backend/app/grudge.py` と揃えて **100m / 2km** とします。

## Issue 用サマリ

- **現状**: 除霊量は「訪問を記録」画面（`#visit`）でしか見えません。地図で推薦地点を選ぶ前に、どの地点がどれだけ効くかが一目で分かりません。
- **提案**: 地図画面の推薦地点カード（`.spot-card`）内に、ぬいに依存しない「最大除霊量の見積もり」を追加します。
- **理由**: ユーザーが「ここまで行けば効く」「ここは遠すぎる」を地図上で直感的に判断でき、実際に足を運ぶ動機になります。
- **注意点**: 除霊量は「ぬいごと」に変わる値です。地図画面ではまだぬいが選ばれていないため、カードに出せるのは「ぬいに依存しない部分」（基本除霊量・距離減衰）に限定されます。実際の除霊量は、引き続き記録画面でぬいを選んだあとに表示します。
- **影響**: 追加表示のみです。API の形は変えません。`frontend/js/map.js` と `frontend/css/style.css` を変更します（`index.html` は触りません）。
- **見積もり**: 半日〜1日（2〜4時間）。

---

## 1. 調査結果

### 1.1 いまの表示

| 場所 | いまの表示 |
|---|---|
| 地図の推薦カード（`#spot-list`） | 順位・地点名・推薦理由・「詳しく見る」「ここで記録する」ボタン |
| 地図上 | 推薦地点のピン、現在地の印 |
| 記録画面（`#visit`） | ぬいを選ぶと `GET /visits/preview` で除霊量・基本・距離を `.stats` で表示 |
| 結果画面（`#visit-result`） | 除霊量の大きな数字と内訳 |

### 1.2 出せる情報と出せない情報

`GET /visits/preview` は `nui_id` が必須で、返す `calm.amount` は「そのぬいの怨念がどれだけ減るか」です。地図画面では `nui_id` がまだ決まっていないので、以下の違いがあります。

| 情報 | ぬい依存 | 地図で出せるか |
|---|---|---|
| 基本除霊量（推薦地点 50、それ以外 10） | なし | ◎ |
| 現在地から推薦地点までの距離 | なし | ◎（フロントで計算できる） |
| 距離減衰係数（100m で 1、2km で 0） | なし | ◎ |
| 同じ場所の連続減衰 | あり（そのぬいの過去の記録） | ×（地図では確定しない） |
| 実際の除霊量 `calm.amount` | あり | × |

したがって、地図で追加する情報は「最大除霊量の見積もり」になります。同じ場所の連続減衰は、ぬいを選んだ記録画面で初めて確定します。

### 1.3 距離減衰の定数

`backend/app/grudge.py` を基準に **100m / 2km** とします。

| 場所 | 距離満額 | 距離ゼロ |
|---|---|---|
| `backend/app/grudge.py` | 100m | 2km |
| `frontend/js/api.js` の `MOCK_GRUDGE` | 100m | 2km |
| `docs/design.md` | 100m | 2km |
| `docs/api.md` | 100m | 2km |
| `docs/tasks/backend-api.md` | 100m | 2km |

※ `frontend/js/map.js` や `frontend/mock/recommend.json` などに書かれた「3km以内」は、推薦地点を探す検索半径を表しており、除霊の距離減衰とは別の値です。本変更では除霊の距離減衰を 100m/2km に統一します。

---

## 2. 実装内容

### 2.1 表示イメージ

`frontend/js/map.js` の `cardFor()` で作っている `.spot-card` の中に、以下を追加します。

```text
┌ 1 ─ 富士見公園 ─────────────────────┐
│ 現在地から約 1.3km。広さ...         │
│                                     │
│ 最大除霊量  32   基本  50   距離 1.3km │
│ 距離減衰 64%。ぬいを選ぶと確定します  │
└─────────────────────────────────────┘
```

※ 1.3km の場合：満額 100m〜ゼロ 2km の間なので、距離係数 = 1 − (1300 − 100) / 1900 ≈ 0.368 → `50 × 0.368 ≈ 18`。計算例は調整後の定数に応じて変わります。

実際の表示例（距離 1.3km）：

```text
最大除霊量  18   基本  50   距離 1.3km
距離減衰 37%。ぬいを選ぶと確定します
```

### 2.2 表示する項目

- **最大除霊量**: 推薦地点なら `50`、それ以外なら `10`（`CALM_RECOMMENDED` / `CALM_OTHER`）に距離係数を掛けた値。
- **基本**: 距離減衰前の基本除霊量。
- **距離**: 現在地から推薦地点までの直線距離。
- **補足**: 「距離減衰 X%。ぬいを選ぶと実際の除霊量が確定します」または「同じ場所の連続減衰は別途適用されます」。

### 2.3 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `frontend/js/map.js` | `cardFor()` で距離と基本除霊量を計算し、カードに `.stats` と `.field-note` を追加 |
| `frontend/css/style.css` | 必要に応じてカード内の新しい行の見た目を微調整（既存クラスのみで済むよう努める） |

### 2.4 距離計算

`frontend/js/api.js` の `distanceM()` と同じハバーサイン公式を使います。ただし現状はモック用のプライベート関数なので、`map.js` 内または `ui.js` に切り出します。

```js
function distanceM(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const p1 = toRad(lat1), p2 = toRad(lat2);
  const dp = p2 - p1;
  const dl = toRad(Number(lng2) - Number(lng1));
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}
```

### 2.5 距離減衰係数

```js
const DISTANCE_FULL_M = 100;
const DISTANCE_ZERO_M = 2000;

function distanceFactor(meters) {
  if (meters <= DISTANCE_FULL_M) return 1;
  if (meters >= DISTANCE_ZERO_M) return 0;
  return 1 - (meters - DISTANCE_FULL_M) / (DISTANCE_ZERO_M - DISTANCE_FULL_M);
}
```

### 2.6 カードへの追加例

```js
function calmStatsFor(spot) {
  const distance = Math.round(distanceM(current.lat, current.lng, spot.lat, spot.lng));
  const factor = distanceFactor(distance);
  const base = CALM_RECOMMENDED; // 推薦地点は固定
  const computed = Math.round(base * factor);

  const stats = document.createElement('dl');
  stats.className = 'stats';
  stats.innerHTML = `
    <div><dt>最大除霊量</dt><dd>${computed}</dd></div>
    <div><dt>基本</dt><dd>${base}</dd></div>
    <div><dt>距離</dt><dd>${distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`}</dd></div>
  `;

  const note = document.createElement('p');
  note.className = 'field-note';
  note.textContent = factor === 0
    ? '2km以上離れているため、この地点では鎮められません。'
    : `距離減衰 ${Math.round(factor * 100)}%。ぬいを選ぶと実際の除霊量が確定します。`;

  return { stats, note };
}
```

### 2.7 カードへの差し込み

`cardFor()` の `li.append(head, facts, actions)` の直前に、上記で作った `stats` と `note` を追加します。

```js
const { stats, note } = calmStatsFor(spot);
li.append(head, facts, stats, note, actions);
```

---

## 3. 難易度

| 項目 | 評価 |
|---|---|
| 実装工数 | **半日〜1日**（2〜4時間） |
| 技術的難易度 | **低〜中** |
| リスク | 小さい。既存の `cardFor()` に処理を追加するだけ |
| デザイン調整 | カードが縦に伸びるので、シートの高さやボタンの位置を微調整する必要あり |
| パフォーマンス | 影響なし。5件分の距離計算は軽微 |

**ポイント**:
- API を増やさず、フロントだけで計算できる。
- 既存の `.stats` / `.field-note` クラスを流用できるため、CSS の追加は最小限で済む。
- ただし、カードの情報量が増え、スマホの横スクロールカードで縦幅が大きくなる。

---

## 4. 実装時の注意

- 地図画面では **実際の除霊量 `calm.amount` は表示しない**。あくまで「最大除霊量の見積もり」にとどめる。
- 実際の除霊量は、引き続き `frontend/js/visit.js` の記録画面で表示する。
- 距離減衰の定数は `backend/app/grudge.py` と揃えて **100m / 2km** とする。
- カードの縦幅が増えるため、PC 表示（`.sheet` が左パネル）でも見た目を確認する。
- `.stats` は 3 列固定なので、「最大除霊量」「基本」「距離」の 3 つにする。
- 距離が 2km 以上の場合は「鎮められません」と明確に表示する。

---

## 5. 受け入れ条件

- [ ] 推薦地点のカードに「最大除霊量」「基本」「距離」が `.stats` で表示される。
- [ ] 距離が 100m 以内なら最大除霊量が基本値（50）と同じになる。
- [ ] 距離が 2km 以上なら「鎮められません」と表示される。
- [ ] カードの見た目がスマホ・PC 両方で崩れない。
- [ ] `index.html` を変更していない。
- [ ] 既存の `.stats` / `.field-note` クラスを使っている（新規クラスは最小限）。
- [ ] モック（`frontend/js/api.js`）とバックエンド（`backend/app/grudge.py`）の距離減衰定数が一致している（100m / 2km）。

---

## 6. 未決事項

- カード内で使う文言（「最大除霊量」「距離減衰」「ぬいを選ぶと確定します」など）。
- カードが縦に伸びたときの、シート高さやボタン位置の調整方針。
