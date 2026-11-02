// 画面の切り替え。URL の # を見て、その <section> だけを表示する。
//
// #map      地図と推薦地点   （フロントA：map.js）
// #visit    訪問の記録       （フロントA：visit.js）
// #nuis     ぬいの一覧       （フロントB：nuis.js の showNuis()）
// #nui/1    ぬいの思い出     （フロントB：nuis.js の showNuiDetail(id)）
// #register ぬいの登録       （フロントB：register.js の showRegister()）

import { showMap } from './map.js';
import { showVisit } from './visit.js';

const DEFAULT_ROUTE = 'map';

// フロントB のファイルは、できるまで読み込みに失敗する。
// そのときに画面全体が止まらないよう、必要になってから import() で読み込む。
const LAZY_SCREENS = {
  nuis: { module: './nuis.js', fn: 'showNuis' },
  nui: { module: './nuis.js', fn: 'showNuiDetail' },
  register: { module: './register.js', fn: 'showRegister' },
};

const ROUTES = ['map', 'visit', ...Object.keys(LAZY_SCREENS)];

// '#nui/1' を { name: 'nui', param: 1 } にする
function parseHash(hash) {
  const [name, param] = String(hash || '').replace(/^#/, '').split('/');
  if (!ROUTES.includes(name)) return { name: DEFAULT_ROUTE, param: undefined };
  // 数字だけの param（ぬいの id）は数値にして渡す
  const value = param && /^\d+$/.test(param) ? Number(param) : param;
  return { name, param: value };
}

function showSection(name) {
  for (const route of ROUTES) {
    const section = document.getElementById(route);
    if (section) section.classList.toggle('is-active', route === name);
  }
  for (const link of document.querySelectorAll('.navbar a')) {
    link.classList.toggle('is-current', link.dataset.route === name);
  }
  window.scrollTo(0, 0);
}

async function callLazyScreen(name, param) {
  const entry = LAZY_SCREENS[name];
  const pending = document.querySelector(`#${name} [data-pending]`);
  try {
    const mod = await import(entry.module);
    if (typeof mod[entry.fn] !== 'function') {
      throw new Error(`${entry.module} に ${entry.fn}() がありません`);
    }
    if (pending) pending.classList.add('hidden');
    await mod[entry.fn](param);
  } catch (err) {
    // まだフロントB の担当分ができていないだけなので、画面は止めない。
    console.warn(`[main] ${entry.module} を読み込めませんでした:`, err.message);
    if (pending) pending.classList.remove('hidden');
  }
}

async function render() {
  const { name, param } = parseHash(location.hash);
  showSection(name);

  if (name === 'map') showMap();
  else if (name === 'visit') showVisit();
  else await callLazyScreen(name, param);
}

window.addEventListener('hashchange', render);

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
