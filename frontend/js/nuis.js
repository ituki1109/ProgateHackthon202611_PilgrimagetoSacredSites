// ぬいの一覧画面（#nuis）と、ぬいの思い出画面（#nui/{id}）を作るファイルです。
// 一覧は api.js の getNuis()、思い出は getVisits() から受け取ります。
// 画面の切り替え（どの # を表示するか）は main.js が行います。

import { getNuis, getVisits } from './api.js';
import { clampGrudge, grudgeGauge, grudgeStage, nuiFace, openPhoto, seal } from './ui.js';

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

// ぬいの写真。photo_url が null のときは、怨念の段階に合わせた顔を出します。
function createNuiPhoto(nui, stageKey, className) {
  if (!nui.photo_url) return nuiFace(stageKey, className);
  const photo = document.createElement('img');
  photo.className = className;
  photo.src = nui.photo_url;
  photo.alt = `${nui.name}の写真`;
  return photo;
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
  link.className = 'text-link back-link';
  link.href = '#nuis';
  link.textContent = 'ぬいの一覧に戻る';
  return link;
}

// 日時の文字列（2026-11-01T15:20:00）を、画面用の日付（2026/11/01）にします。
function formatDate(value) {
  const text = String(value || '');
  const date = text.slice(0, 10).replace(/-/g, '/');
  return date || '日付なし';
}

// ぬい1体分のカードを作ります。
function createNuiCard(nui) {
  const grudge = clampGrudge(nui.grudge);
  const stage = grudgeStage(grudge);

  // カード全体をリンクにします。押すと #nui/1 のようになり、思い出の画面を開きます。
  const card = document.createElement('a');
  card.className = `nui-card is-${stage.key}`;
  card.href = `#nui/${nui.id}`;

  card.appendChild(createNuiPhoto(nui, stage.key, 'nui-photo'));

  const body = document.createElement('div');
  body.className = 'nui-body';

  const name = document.createElement('h3');
  name.className = 'nui-name';
  name.textContent = nui.name; // textContent なら名前に記号があっても安全

  const meta = document.createElement('p');
  meta.className = 'nui-meta';
  const value = document.createElement('span');
  value.className = 'grudge-value';
  value.textContent = `怨念 ${grudge}`;
  const label = document.createElement('span');
  label.className = `stage-label is-${stage.key}`;
  label.textContent = stage.label;
  const visits = document.createElement('span');
  visits.className = 'nui-visits';
  visits.textContent = `訪問 ${nui.visit_count ?? 0}回`;
  meta.append(value, label, visits);

  body.append(name, grudgeGauge(grudge, `${nui.name}の怨念`), meta);
  card.appendChild(body);
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
    const nuis = await getNuis();
    const list = Array.isArray(nuis) ? nuis : [];

    container.replaceChildren(); // 「読み込み中…」を消す

    // ぬいが1体もいないときの案内
    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'まだぬいが登録されていません。「登録」から追加してください。';
      container.appendChild(empty);
    }

    // 取ってきた順番（登録した順）にカードを並べます。
    for (const nui of list) {
      container.appendChild(createNuiCard(nui));
    }

    const add = document.createElement('a');
    add.className = 'button add-nui';
    add.href = '#register';
    add.textContent = 'ぬいを登録する';
    container.appendChild(add);
  } catch (error) {
    container.replaceChildren();
    container.appendChild(createError(`ぬいの一覧を読み込めませんでした：${error.message}`));
  }
}

// 思い出の画面の上に出す、そのぬいの名前と怨念。
function createNuiHeader(nui) {
  const grudge = clampGrudge(nui.grudge);
  const stage = grudgeStage(grudge);

  const header = document.createElement('div');
  header.className = `nui-header is-${stage.key}`;
  header.appendChild(createNuiPhoto(nui, stage.key, 'nui-photo is-large'));

  const body = document.createElement('div');
  body.className = 'nui-body';
  const name = document.createElement('h3');
  name.className = 'nui-name is-large';
  name.textContent = nui.name;

  const meta = document.createElement('p');
  meta.className = 'nui-meta';
  const value = document.createElement('span');
  value.className = 'grudge-value';
  value.textContent = `怨念 ${grudge}`;
  const label = document.createElement('span');
  label.className = `stage-label is-${stage.key}`;
  label.textContent = stage.label;
  meta.append(value, label);

  const since = document.createElement('p');
  since.className = 'nui-since';
  since.textContent = `最後に連れ出した日 ${formatDate(nui.last_outing_date)}`;

  body.append(name, grudgeGauge(grudge, `${nui.name}の怨念`), meta, since);
  header.appendChild(body);
  return header;
}

// 訪問の記録1件分。御朱印帳の1ページのように、推薦地点の記録には朱印を押します。
function createVisitCard(visit) {
  const card = document.createElement('article');
  card.className = `visit-card${visit.recommended ? ' is-recommended' : ''}`;

  const frame = document.createElement('div');
  frame.className = 'visit-photo-frame';
  if (visit.photo_url) {
    // 押すと写真を大きく見られるよう、ボタンの中に入れます。
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'visit-photo-button';
    button.setAttribute('aria-label', `${visit.spot_name || '訪問先'}の写真を大きく見る`);
    const photo = document.createElement('img');
    photo.className = 'visit-photo';
    photo.src = visit.photo_url;
    photo.alt = `${visit.spot_name || '訪問先'}の写真`;
    button.appendChild(photo);
    button.addEventListener('click', () => {
      openPhoto(visit.photo_url, photo.alt, {
        title: visit.spot_name || '場所の記録',
        sub: formatDate(visit.created_at),
        recommended: Boolean(visit.recommended),
      });
    });
    frame.appendChild(button);
  } else {
    const blank = document.createElement('p');
    blank.className = 'visit-photo-blank';
    blank.textContent = '写真なし';
    frame.appendChild(blank);
  }
  card.appendChild(frame);

  const body = document.createElement('div');
  body.className = 'visit-body';

  const place = document.createElement('h3');
  place.className = 'visit-place';
  place.textContent = visit.spot_name || '場所の記録';

  const date = document.createElement('p');
  date.className = 'visit-date';
  date.textContent = formatDate(visit.created_at);

  const kind = document.createElement('p');
  kind.className = 'visit-kind';
  kind.textContent = visit.recommended ? '推薦された地点' : '推薦地点の外';

  body.append(place, date, kind);
  card.append(body, seal(visit.recommended ? '鎮' : '記', visit.recommended));
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
    // そのぬいの名前と怨念（getNuis）と、訪問の記録（getVisits）を一緒に取ります。
    const [nuis, visits] = await Promise.all([getNuis(), getVisits(nuiId)]);
    const nui = (Array.isArray(nuis) ? nuis : []).find((n) => n.id === nuiId);
    const list = Array.isArray(visits) ? visits : [];

    container.replaceChildren();
    container.appendChild(createBackLink());
    if (nui) container.appendChild(createNuiHeader(nui));

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

    const summary = document.createElement('h3');
    summary.className = 'list-title';
    const sealed = sorted.filter((v) => v.recommended).length;
    summary.textContent = `思い出 ${sorted.length}件（朱印 ${sealed}）`;
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
