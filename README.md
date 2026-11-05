# ぬい憑き

Progateハッカソン powered by ProjectLINKS（2026年11月）で開発するプロダクトです。

## サービスの概要

「ぬい憑き」は、置いたままのぬいぐるみを連れて街へ出かけるぬい活アプリです。最後に連れ出した日から、ぬいに宿った怨念の強さが決まります。国土交通省のPLATEAUや国土数値情報、川崎市のオープンデータから出かける先を推薦し、訪れた場所でぬいと写真を残すと怨念が鎮まります。推薦された場所で記録すると、より多く鎮まります。

## 作った背景

ぬい活をする人の中には、ぬいぐるみを何体も持っている人がいます。しかし外出時に連れて行ける数には限りがあり、つい一番の推しの最新のぬいを選んでしまいます。置いていくたびに申し訳なく思っても、以前のぬいの写真はある時期から増えなくなります。そこで、置かれたままのぬいに怨念を宿らせ、そのぬいを選んで出かける理由を作りました。

## 推し技術

PythonとpandasでPLATEAU、国土数値情報、川崎市のオープンデータを整え、地点の一覧を作ります。現在地からの距離とデータの値でルールベースの点数を付け、出かける先を理由つきで推薦します。推薦の処理はデータの前処理と分けて作るので、中間発表で配られる新しいデータもすぐ足せます。画面はWebで作っています。ARでぬいに怨念が憑依する演出は、記録の結果画面から開きます。

## 技術スタック

| 部分 | 使うもの |
|---|---|
| データの前処理と推薦 | Python、pandas、NumPy |
| API | FastAPI、SQLite |
| 画面 | HTML、CSS、JavaScript、Leaflet |
| AR | MindAR、Three.js |

## デモの動かし方

`backend` で次を実行し、`http://localhost:8000/` を開きます。`seed.py` は、デモ用のぬい3体と訪問の記録を入れ直します。

```bash
pip install -r requirements.txt
python scripts/seed.py
uvicorn app.main:app --port 8000
```

現在地は川崎駅から始まります。地図を押すと、その場所を現在地にして推薦地点を取り直します。AR の試し方は [frontend/ar/README.md](frontend/ar/README.md) にあります。

## 開発の資料

設計と分担は [docs/](docs/) にまとめています。AI に実装を頼むときは、[AGENTS.md](AGENTS.md) の手順で文書を読ませてください。

- [技術と機能のまとめ](docs/overview.md)
- [全体設計](docs/design.md)
- [API 仕様](docs/api.md)
- 担当ごとの作業：[バックエンドA](docs/tasks/backend-data.md)、[バックエンドB](docs/tasks/backend-api.md)、[フロントA](docs/tasks/frontend-main.md)、[フロントB](docs/tasks/frontend-nui.md)

## Issueのラベル

機能の優先度はMoSCoW法の4つのラベルで管理します。

| ラベル | 意味 |
|---|---|
| `must` | 必ず実装する（これがないと成立しない） |
| `should` | できれば実装する（重要だが必須ではない） |
| `could` | 余裕があれば実装する |
| `won't` | 今回は実装しない |

## イベント

- [Progateハッカソン powered by ProjectLINKS](https://app.path.progate.com/events/BxFki4NPd9Trb-srUwChJ)
- 本番: 2026年11月7日〜8日（川崎・Uvance Innovation Studio）
- 成果発表はスライドを使わず、動作デモとこのリポジトリで行います。
