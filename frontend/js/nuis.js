// ぬいの一覧画面（#nuis）と、ぬいの思い出画面（#nui/{id}）を作るファイルです。
// 一覧は api.js の getNuis()、思い出は getVisits() から受け取ります。
// 画面の切り替え（どの # を表示するか）は main.js が行います。

import { getNuis, getVisits } from './api.js';

// 怨念の強さから、段階の名前と CSS のクラス名を決めます。
// 段階の分け方は docs/design.md の「怨念の段階」と同じです。
function grudgeStage(grudge) {
  if (grudge <= 0) return { label: '鎮まった', key: 'calm' }; // 0
  if (grudge <= 39) return { label: '弱い', key: 'weak' }; // 1〜39
  if (grudge <= 69) return { label: '中くらい', key: 'medium' }; // 40〜69
  return { label: '強い', key: 'strong' }; // 70〜100
}

// 画面の中に、中身を入れる箱を1つ用意します。
// すでにあるときは中身だけ空にして、作り直せるようにします。
function getContainer(section, className) {
  let container = section.querySelector(`.${className}`);

  if (!container) {
    container = document.createElement('div');
    container.className = className;
    section.appendChild(container);
  }

  container.replaceChildren(); // 前回の内容を空にする
  return container;
}

// 「ここはフロントB の担当です」という案内を隠します。
function hidePending(section) {
  const pending = section.querySelector('[data-pending]');
  if (pending) pending.classList.add('hidden');
}

// 写真がないときに出す、ぬいの代わり表示を作ります。
function createPhotoPlaceholder(className) {
  const placeholder = document.createElement('div');
  placeholder.className = `${className} photo-placeholder`;
  placeholder.setAttribute('aria-hidden', 'true'); // 写真の説明は別に出す
  placeholder.textContent = '🧸';
  return placeholder;
}

// エラーの文を画面に出すための <p> を作ります。
function createError(message) {
  const error = document.createElement('p');
  error.className = 'error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  return error;
}

// 思い出画面から一覧へ戻るリンクを作ります。
function createBackLink() {
  const link = document.createElement('a');
  link.className = 'back-link';
  link.href = '#nuis';
  link.textContent = '← ぬいの一覧に戻る';
  return link;
}

// ぬい1体分のカードを作ります。
function createNuiCard(nui) {
  // 怨念を 0〜100 の数値にそろえます（API は整数で返します）。
  const grudge = Math.max(0, Math.min(100, Number(nui.grudge) || 0));
  const stage = grudgeStage(grudge);

  // カード全体をリンクにします。
  // 押すと URL が #nui/1 のようになり、main.js が思い出の画面を開きます。
  const card = document.createElement('a');
  card.className = 'nui-card';
  card.href = `#nui/${nui.id}`;

  // 写真。photo_url が null のときは、代わりに 🧸 を出します。
  if (nui.photo_url) {
    const photo = document.createElement('img');
    photo.className = 'nui-photo';
    photo.src = nui.photo_url;
    photo.alt = `${nui.name}の写真`;
    card.appendChild(photo);
  } else {
    card.appendChild(createPhotoPlaceholder('nui-photo'));
  }

  // 名前
  const name = document.createElement('h3');
  name.className = 'nui-name';
  name.textContent = nui.name; // textContent なら名前に記号があっても安全
  card.appendChild(name);

  // 怨念のゲージ（横棒）。幅で強さを表し、色は CSS の is-... で変えます。
  const gauge = document.createElement('div');
  gauge.className = 'grudge-gauge';
  gauge.setAttribute('role', 'progressbar');
  gauge.setAttribute('aria-label', `${nui.name}の怨念`);
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  gauge.setAttribute('aria-valuenow', String(grudge));

  const gaugeFill = document.createElement('div');
  gaugeFill.className = `grudge-gauge-fill is-${stage.key}`;
  gaugeFill.style.width = `${grudge}%`; // 怨念の数だけ棒を伸ばす
  gauge.appendChild(gaugeFill);

  card.appendChild(gauge);

  // 怨念の数・段階と、訪問の数
  const info = document.createElement('p');
  info.className = 'nui-info';
  info.textContent = `怨念 ${grudge} / 100（${stage.label}）`;

  const visits = document.createElement('span');
  visits.className = 'nui-visits';
  visits.textContent = `訪問 ${nui.visit_count ?? 0}回`;
  info.appendChild(visits);

  card.appendChild(info);
  return card;
}

// #nuis 画面を表示します。main.js から呼ばれます。
export async function showNuis() {
  const section = document.getElementById('nuis');
  if (!section) return;

  hidePending(section);

  const container = getContainer(section, 'nui-list');
  container.textContent = '読み込み中…';

  try {
    // api.js の getNuis() で、ぬいの一覧を取ります。
    // API がまだのときは、mock/nuis.json の仮データが返ります。
    const nuis = await getNuis();
    const list = Array.isArray(nuis) ? nuis : [];

    container.replaceChildren(); // 「読み込み中…」を消す

    // ぬいが1体もいないときの案内
    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'まだぬいが登録されていません。「登録」から追加してください。';
      container.appendChild(empty);
      return;
    }

    // 取ってきた順番（登録した順）にカードを並べます。
    for (const nui of list) {
      container.appendChild(createNuiCard(nui));
    }
  } catch (error) {
    container.replaceChildren();
    container.appendChild(createError(`ぬいの一覧を読み込めませんでした：${error.message}`));
  }
}

// 日時の文字列（2026-11-01T15:20:00）を、画面用の日付（2026/11/01）にします。
function formatDate(value) {
  const text = String(value || '');
  const date = text.slice(0, 10).replace(/-/g, '/');
  return date || '日付なし';
}

// 訪問の記録1件分のカードを作ります。
function createVisitCard(visit) {
  const card = document.createElement('article');
  card.className = 'visit-card';

  // 写真。photo_url が null のときは、代わりに 🧸 を出します。
  if (visit.photo_url) {
    const photo = document.createElement('img');
    photo.className = 'visit-photo';
    photo.src = visit.photo_url;
    photo.alt = `${visit.spot_name || '訪問先'}の写真`;
    card.appendChild(photo);
  } else {
    card.appendChild(createPhotoPlaceholder('visit-photo'));
  }

  const body = document.createElement('div');
  body.className = 'visit-body';

  // 地点の名前
  const place = document.createElement('h3');
  place.className = 'visit-place';
  place.textContent = visit.spot_name || '場所の記録';
  body.appendChild(place);

  // 推薦地点で記録したときは、目印を付けます。
  if (visit.recommended) {
    const badge = document.createElement('span');
    badge.className = 'visit-badge';
    badge.textContent = '推薦地点';
    body.appendChild(badge);
  }

  // 日付
  const date = document.createElement('p');
  date.className = 'visit-date';
  date.textContent = formatDate(visit.created_at);
  body.appendChild(date);

  card.appendChild(body);
  return card;
}

// #nui/{id} 画面を表示します。main.js から id を受け取ります。
export async function showNuiDetail(id) {
  const section = document.getElementById('nui');
  if (!section) return;

  hidePending(section);

  const container = getContainer(section, 'nui-detail');
  const nuiId = Number(id);

  // URL が #nui だけのときなど、番号がない場合は一覧へ戻ってもらいます。
  if (!Number.isInteger(nuiId) || nuiId <= 0) {
    container.appendChild(createError('ぬいの番号が正しくありません。一覧から選び直してください。'));
    container.appendChild(createBackLink());
    return;
  }

  container.textContent = '読み込み中…';

  try {
    // api.js の getVisits(id) で、そのぬいの訪問の記録を取ります。
    const visits = await getVisits(nuiId);
    const list = Array.isArray(visits) ? visits : [];

    container.replaceChildren();
    container.appendChild(createBackLink());

    // 記録がまだないときの案内
    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'まだ思い出がありません。地図から訪問を記録してみましょう。';
      container.appendChild(empty);
      return;
    }

    // 念のため、新しい順に並べ替えます（API も新しい順で返します）。
    const sorted = [...list].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );

    const summary = document.createElement('p');
    summary.className = 'detail-summary';
    summary.textContent = `思い出 ${sorted.length}件`;
    container.appendChild(summary);

    const visitList = document.createElement('div');
    visitList.className = 'visit-list';

    for (const visit of sorted) {
      visitList.appendChild(createVisitCard(visit));
    }

    container.appendChild(visitList);
  } catch (error) {
    container.replaceChildren();
    container.appendChild(createBackLink());
    container.appendChild(createError(`思い出を読み込めませんでした：${error.message}`));
  }
}
