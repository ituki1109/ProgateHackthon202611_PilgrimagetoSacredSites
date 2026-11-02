// ぬいの一覧画面（#nuis）を作るファイルです。
// データは api.js の getNuis() から受け取り、1体ずつカードにして並べます。
// 画面の切り替え（#nuis を表示するか）は main.js が行います。

import { getNuis } from './api.js';

// 怨念の強さから、段階の名前とゲージの色を決めます。
// 段階の分け方は docs/design.md の「怨念の段階」と同じです。
function grudgeStage(grudge) {
  if (grudge <= 0) return { label: '鎮まった', color: '#4ade80' }; // 0：緑
  if (grudge <= 39) return { label: '弱い', color: '#c084fc' }; // 1〜39：紫
  if (grudge <= 69) return { label: '中くらい', color: '#fbbf24' }; // 40〜69：黄色
  return { label: '強い', color: '#f87171' }; // 70〜100：赤
}

// 一覧を入れる箱を用意します。
// 2回目以降にこの画面へ戻ってきたときは、古いカードを消してから作り直します。
function getListContainer(section) {
  let container = section.querySelector('.nui-list');

  if (!container) {
    container = document.createElement('div');
    container.className = 'nui-list';
    section.appendChild(container);
  }

  container.replaceChildren(); // 前回のカードを空にする
  return container;
}

// ぬい1体分のカードを作ります。
function createCard(nui) {
  // 怨念を 0〜100 の数値にそろえます（API は整数で返します）。
  const grudge = Math.max(0, Math.min(100, Number(nui.grudge) || 0));
  const stage = grudgeStage(grudge);

  // カード全体をリンクにします。
  // 押すと URL が #nui/1 のようになり、main.js が思い出の画面を開きます。
  const card = document.createElement('a');
  card.className = 'nui-card';
  card.href = `#nui/${nui.id}`;
  card.style.display = 'block'; // CSS がなくてもカードとして縦に並ぶようにする

  // 写真を出します。photo_url が null のときは、代わりに「ぬい」の印を出します。
  if (nui.photo_url) {
    const photo = document.createElement('img');
    photo.className = 'nui-photo';
    photo.src = nui.photo_url;
    photo.alt = `${nui.name}の写真`;
    card.appendChild(photo);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'nui-photo nui-photo-placeholder';
    placeholder.setAttribute('aria-hidden', 'true'); // 名前は別に出すので、読み上げない
    placeholder.textContent = '🧸';
    card.appendChild(placeholder);
  }

  // 名前
  const name = document.createElement('h3');
  name.className = 'nui-name';
  name.textContent = nui.name; // textContent なら名前に記号があっても安全
  card.appendChild(name);

  // 怨念のゲージ（横棒）。幅と色で強さを表します。
  const gauge = document.createElement('div');
  gauge.className = 'grudge-gauge';
  gauge.setAttribute('role', 'progressbar');
  gauge.setAttribute('aria-label', `${nui.name}の怨念`);
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  gauge.setAttribute('aria-valuenow', String(grudge));
  // CSS がなくてもゲージが見えるように、最低限の見た目をここで指定します。
  gauge.style.height = '10px';
  gauge.style.background = 'rgba(255, 255, 255, 0.2)';
  gauge.style.borderRadius = '999px';
  gauge.style.overflow = 'hidden';

  const gaugeFill = document.createElement('div');
  gaugeFill.className = 'grudge-gauge-fill';
  gaugeFill.style.width = `${grudge}%`; // 怨念の数だけ棒を伸ばす
  gaugeFill.style.height = '100%';
  gaugeFill.style.backgroundColor = stage.color; // 段階ごとに色を変える
  gaugeFill.style.borderRadius = '999px';
  gauge.appendChild(gaugeFill);

  card.appendChild(gauge);

  // 怨念の数、段階、訪問の数
  const info = document.createElement('p');
  info.className = 'nui-info';
  info.textContent = `怨念 ${grudge} / 100（${stage.label}） ・ 訪問 ${nui.visit_count ?? 0}回`;
  card.appendChild(info);

  return card;
}

// #nuis 画面を表示します。main.js から呼ばれます。
export async function showNuis() {
  const section = document.getElementById('nuis');
  if (!section) return;

  // 「ここはフロントB の担当です」という案内を隠します。
  const pending = section.querySelector('[data-pending]');
  if (pending) pending.classList.add('hidden');

  const container = getListContainer(section);
  container.textContent = '読み込み中…';

  try {
    // api.js の getNuis() で、ぬいの一覧を取ります。
    // API がまだのときは、mock/nuis.json の仮データが返ります。
    const nuis = await getNuis();

    container.replaceChildren(); // 「読み込み中…」を消す

    // ぬいが1体もいないときの案内
    if (!nuis || nuis.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'まだぬいが登録されていません。「登録」から追加してください。';
      container.appendChild(empty);
      return;
    }

    // 取ってきた順番（登録した順）にカードを並べます。
    for (const nui of nuis) {
      container.appendChild(createCard(nui));
    }
  } catch (error) {
    // 通信に失敗したときなどは、画面に理由を出します。
    container.replaceChildren();

    const message = document.createElement('p');
    message.className = 'error';
    message.setAttribute('role', 'alert');
    message.textContent = `ぬいの一覧を読み込めませんでした：${error.message}`;
    container.appendChild(message);
  }
}
