// ぬいの一覧画面（#nuis）と、ぬいの思い出画面（#nui/{id}）を作るファイルです。
// 一覧は api.js の getNuis()、思い出は getVisits() から受け取ります。
// 画面の切り替え（どの # を表示するか）は main.js が行います。

import { getNuis, getVisits } from './api.js';
import { clampGrudge, grudgeGauge, grudgeStage, nuiAvatar, nuiFace, openPhoto, seal, stageChip } from './ui.js';

// 画面の中に、中身を入れる箱を1つ用意します。
// すでにあるときは中身だけ空にして、作り直せるようにします。
function getContainer(section, className) {
  const page = section.querySelector('.page') || section;
  let container = page.querySelector(`.${className}`);

  if (!container) {
    container = document.createElement('div');
    container.className = className;
    page.appendChild(container);
  }

  container.replaceChildren(); // 前回の内容を空にする
  return container;
}

// 「ここはフロントB の担当です」という案内を隠します。
function hidePending(section) {
  const pending = section.querySelector('[data-pending]');
  if (pending) pending.classList.add('hidden');
}

// エラーの文を画面に出すための <p> を作ります。
function createError(message) {
  const error = document.createElement('p');
  error.className = 'error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  return error;
}

// 中身がないときの案内。顔と文と、次にすることのボタンを出します。
function createEmpty(text, href, label) {
  const box = document.createElement('div');
  box.className = 'empty';
  const message = document.createElement('p');
  message.textContent = text;
  const action = document.createElement('a');
  action.className = 'button is-primary';
  action.href = href;
  action.textContent = label;
  box.append(nuiFace('calm', 'empty-face'), message, action);
  return box;
}

// 日時の文字列（2026-11-01T15:20:00）を、画面用の日付（2026/11/01）にします。
function formatDate(value) {
  const text = String(value || '');
  const date = text.slice(0, 10).replace(/-/g, '/');
  return date || '日付なし';
}

// 一覧のいちばん上に出す、いちばん怨念の強いぬい。連れ出すボタンも付けます。
function createHero(nui) {
  const grudge = clampGrudge(nui.grudge);
  const stage = grudgeStage(grudge);

  const hero = document.createElement('div');
  hero.className = `nui-hero is-${stage.key}`;

  const main = document.createElement('a');
  main.className = 'hero-main';
  main.href = `#nui/${nui.id}`;

  const body = document.createElement('div');
  body.className = 'hero-body';
  const kicker = document.createElement('p');
  kicker.className = 'hero-kicker';
  kicker.textContent = grudge > 0 ? 'いちばん怨んでいるぬい' : 'どのぬいも鎮まっています';
  const name = document.createElement('h3');
  name.className = 'hero-name';
  name.textContent = nui.name;
  const meta = document.createElement('p');
  meta.className = 'hero-meta';
  meta.append(`怨念 ${grudge}`, stageChip(grudge));
  body.append(kicker, name, meta, grudgeGauge(grudge, `${nui.name}の怨念`));

  main.append(nuiAvatar(nui, 'hero-avatar'), body);

  const go = document.createElement('a');
  go.className = 'button is-primary is-block';
  go.href = '#map';
  go.textContent = grudge > 0 ? `${nui.name}を連れ出す場所を探す` : '連れ出す場所を探す';

  hero.append(main, go);
  return hero;
}

// ぬい1体分のタイル。押すと #nui/1 のようになり、思い出の画面を開きます。
function createNuiTile(nui) {
  const grudge = clampGrudge(nui.grudge);

  const tile = document.createElement('a');
  tile.className = `nui-tile is-${grudgeStage(grudge).key}`;
  tile.href = `#nui/${nui.id}`;

  const name = document.createElement('h3');
  name.className = 'nui-tile-name';
  name.textContent = nui.name; // textContent なら名前に記号があっても安全

  const meta = document.createElement('p');
  meta.className = 'nui-tile-meta';
  meta.append(stageChip(grudge), `怨念 ${grudge}`);

  const visits = document.createElement('p');
  visits.className = 'nui-tile-visits';
  visits.textContent = `訪問 ${nui.visit_count ?? 0}回`;

  tile.append(nuiAvatar(nui, 'nui-tile-avatar'), name, meta, grudgeGauge(grudge, `${nui.name}の怨念`), visits);
  return tile;
}

// 一覧の最後に置く、登録の画面へのタイル
function createAddTile() {
  const tile = document.createElement('a');
  tile.className = 'nui-tile is-add';
  tile.href = '#register';
  tile.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>';
  const label = document.createElement('span');
  label.textContent = 'ぬいを登録する';
  tile.appendChild(label);
  return tile;
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
      container.appendChild(createEmpty('まだぬいが登録されていません。', '#register', 'ぬいを登録する'));
      return;
    }

    const top = [...list].sort((a, b) => b.grudge - a.grudge)[0];
    container.appendChild(createHero(top));

    // 取ってきた順番（登録した順）にタイルを並べます。
    const grid = document.createElement('div');
    grid.className = 'nui-grid';
    for (const nui of list) {
      grid.appendChild(createNuiTile(nui));
    }
    grid.appendChild(createAddTile());
    container.appendChild(grid);
  } catch (error) {
    container.replaceChildren();
    container.appendChild(createError(`ぬいの一覧を読み込めませんでした：${error.message}`));
  }
}

// 思い出の画面の上に出す、そのぬいの写真、怨念、記録の数。
function createProfile(nui, visits) {
  const grudge = clampGrudge(nui.grudge);

  const profile = document.createElement('div');
  profile.className = `profile is-${grudgeStage(grudge).key}`;

  const avatar = nuiAvatar(nui, 'profile-avatar');
  if (nui.photo_url) {
    // ぬいの写真も、押すと大きく見られるようにします。
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-photo-button';
    button.setAttribute('aria-label', `${nui.name}の写真を大きく見る`);
    button.appendChild(avatar);
    button.addEventListener('click', () => openPhoto(nui.photo_url, avatar.alt, { title: nui.name }));
    profile.appendChild(button);
  } else {
    profile.appendChild(avatar);
  }

  const name = document.createElement('h3');
  name.className = 'profile-name';
  name.textContent = nui.name;

  const meta = document.createElement('p');
  meta.className = 'profile-meta';
  meta.append(`怨念 ${grudge}`, stageChip(grudge));

  const sealed = visits.filter((v) => v.recommended).length;
  const stats = document.createElement('dl');
  stats.className = 'stats';
  for (const [term, value] of [
    ['思い出', `${visits.length}件`],
    ['朱印', `${sealed}個`],
    ['最後に連れ出した日', formatDate(nui.last_outing_date)],
  ]) {
    const item = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    item.append(dt, dd);
    stats.appendChild(item);
  }

  const go = document.createElement('a');
  go.className = 'button is-primary';
  go.href = '#map';
  go.textContent = '連れ出す場所を探す';

  profile.append(name, meta, grudgeGauge(grudge, `${nui.name}の怨念`), stats, go);
  return profile;
}

// 訪問の記録1件分。御朱印帳の1ページのように、推薦地点の記録には朱印を押します。
function createMemory(visit) {
  const card = document.createElement('article');
  card.className = `memory${visit.recommended ? ' is-recommended' : ''}`;
  const placeName = visit.spot_name || '場所の記録';
  const mark = seal(visit.recommended ? '鎮' : '記', visit.recommended);

  if (visit.photo_url) {
    // 押すと写真を大きく見られるよう、ボタンの中に入れます。
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'memory-photo';
    button.setAttribute('aria-label', `${placeName}の写真を大きく見る`);
    const photo = document.createElement('img');
    photo.src = visit.photo_url;
    photo.alt = `${placeName}の写真`;
    photo.loading = 'lazy';
    button.append(photo, mark);
    button.addEventListener('click', () => {
      openPhoto(visit.photo_url, photo.alt, {
        title: placeName,
        sub: formatDate(visit.created_at),
        recommended: Boolean(visit.recommended),
      });
    });
    card.appendChild(button);
  } else {
    const blank = document.createElement('div');
    blank.className = 'memory-photo is-blank';
    const text = document.createElement('span');
    text.textContent = '写真なし';
    blank.append(text, mark);
    card.appendChild(blank);
  }

  const body = document.createElement('div');
  body.className = 'memory-body';

  const place = document.createElement('h4');
  place.className = 'memory-place';
  place.textContent = placeName;

  const date = document.createElement('p');
  date.className = 'memory-date';
  date.textContent = formatDate(visit.created_at);

  const kind = document.createElement('p');
  kind.className = 'memory-kind';
  kind.textContent = visit.recommended ? '推薦された地点' : '推薦地点の外';

  body.append(place, date, kind);
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
    container.appendChild(createEmpty('ぬいの番号が正しくありません。一覧から選び直してください。', '#nuis', 'ぬいの一覧へ'));
    return;
  }

  container.textContent = '読み込み中…';

  try {
    // そのぬいの名前と怨念（getNuis）と、訪問の記録（getVisits）を一緒に取ります。
    const [nuis, visits] = await Promise.all([getNuis(), getVisits(nuiId)]);
    const nui = (Array.isArray(nuis) ? nuis : []).find((n) => n.id === nuiId);
    const list = Array.isArray(visits) ? visits : [];

    container.replaceChildren();
    if (!nui) {
      container.appendChild(createEmpty('このぬいは見つかりませんでした。', '#nuis', 'ぬいの一覧へ'));
      return;
    }
    container.appendChild(createProfile(nui, list));

    const title = document.createElement('h3');
    title.className = 'section-title';
    title.textContent = '思い出';
    container.appendChild(title);

    // 記録がまだないときの案内
    if (list.length === 0) {
      container.appendChild(createEmpty('まだ思い出がありません。地図から訪問を記録してみましょう。', '#map', '地図を開く'));
      return;
    }

    // 念のため、新しい順に並べ替えます（API も新しい順で返します）。
    const sorted = [...list].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );

    const grid = document.createElement('div');
    grid.className = 'memory-grid';
    for (const visit of sorted) {
      grid.appendChild(createMemory(visit));
    }
    container.appendChild(grid);
  } catch (error) {
    container.replaceChildren();
    container.appendChild(createError(`思い出を読み込めませんでした：${error.message}`));
  }
}
