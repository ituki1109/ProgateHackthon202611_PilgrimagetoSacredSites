# フロントB：ぬいの画面と見た目

ぬいの登録、一覧、思い出の画面と、アプリ全体の見た目を作る担当です。どの画面も、API からデータをもらって表示するだけなので、1画面ずつ順に作れます。

## 書くファイル

- `frontend/index.html` のうち、`#nuis`、`#nui`、`#register` の `<section>` の中身
- `frontend/js/nuis.js`
- `frontend/js/register.js`
- `frontend/css/style.css`

## 始める前に

フロントA が、画面の骨組み（`index.html`、`main.js`）と API の呼び出し（`api.js`）を先に作ります。それができたら始めてください。

API はまだできていないので、`frontend/mock/` の仮の JSON を表示して作ります。`api.js` の関数を呼ぶと、仮の JSON が返ってきます。

`frontend` で次を実行し、`http://localhost:5500/` を開くと確かめられます。

```bash
python -m http.server 5500
```

## must

### 1. ぬいの一覧（`#nuis`）

`frontend/js/nuis.js` に `showNuis()` を作ります。

- `getNuis()` でぬいを取り、カードを並べる
- カードには、写真、名前、怨念のゲージ、訪問の数を出す
- ゲージの色は、[design.md](../design.md) の「怨念の段階」で変える
- カードを押すと、そのぬいの思い出（`#nui/1` など）に進む

**できあがり:** 仮の JSON の3体が、怨念の強さの違いが分かる形で並ぶ。

### 2. ぬいの思い出（`#nui/{id}`）

`frontend/js/nuis.js` に `showNuiDetail(id)` を作ります。

- `getVisits(id)` で訪問の記録を取り、新しい順に並べる
- 記録ごとに、写真、地点の名前、日付を出す
- 推薦地点での記録（`recommended` が true）には、目印を付ける

### 3. ぬいの登録（`#register`）

`frontend/js/register.js` に `showRegister()` を作ります。

- 入力するのは、名前、写真、最後に連れ出した日
- 「登録する」を押したら `createNui(formData)` を呼び、終わったら一覧（`#nuis`）に戻る
- 名前と日付が空なら、送らずに知らせる

### 4. 見た目

`frontend/css/style.css` で、アプリ全体の色や文字を決めます。

- 怨念がテーマなので、暗めの色（紫や青）を基本にする
- スマートフォンの幅（375px）で崩れないようにする

## should

- **怨念の強さで変わるセリフ。** カードや思い出の画面に、ぬいのセリフを出す。セリフは [design.md](../design.md) の「怨念の段階」の例を使う。

## 困ったとき

- 画面に何も出ないときは、ブラウザーの開発者ツール（F12）のコンソールに出ているエラーを、そのまま AI に見せる。
- フロントA のファイル（`main.js`、`api.js` など）は書き換えず、困ったらフロントA に相談する。

## AI への最初の指示の例

> docs/design.md、docs/api.md、docs/tasks/frontend-nui.md を読んでください。私はフロントB の担当で、プログラミングは初心者です。まず must の1（ぬいの一覧）を作ってください。frontend/js/api.js の getNuis() を使い、ほかのファイルは書き換えないでください。コードには、何をしているかの短い説明を付けてください。
