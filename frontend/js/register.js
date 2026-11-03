// ぬいの登録画面（#register）を作るファイルです。
// 入力内容を api.js の createNui() に送り、成功したら一覧（#nuis）へ戻ります。

import { createNui } from './api.js';
import { nuiFace } from './ui.js';

// 登録フォームの HTML です。入力欄の名前は docs/api.md の POST /nuis に合わせています。
const FORM_HTML = `
  <form class="form register-form" novalidate>
    <label class="avatar-pick">
      <input type="file" name="photo" accept="image/*" class="visually-hidden">
      <span class="avatar-pick-circle">
        <img class="avatar-pick-preview" alt="選んだ写真" hidden>
        <span class="avatar-pick-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3.5 8.5h3.5l2-3h6l2 3h3.5v11h-17z"/><circle cx="12" cy="13.5" r="3.5"/></svg>
        </span>
      </span>
      <span class="avatar-pick-label">写真を選ぶ <span class="optional">任意</span></span>
    </label>

    <label class="field">
      <span class="field-label">名前 <span class="required">必須</span></span>
      <input type="text" name="name" maxlength="40" autocomplete="off" placeholder="例：もちもち">
    </label>

    <label class="field">
      <span class="field-label">最後に連れ出した日 <span class="required">必須</span></span>
      <input type="date" name="last_outing_date">
      <span class="field-note">この日から、1日ごとに怨念が 2 ずつたまります。</span>
    </label>

    <p class="form-error error" role="alert" hidden></p>
    <button type="submit" class="button is-primary is-block">登録する</button>
  </form>
`;

// 「ここはフロントB の担当です」という案内を隠します。
function hidePending(section) {
  const pending = section.querySelector('[data-pending]');
  if (pending) pending.classList.add('hidden');
}

// フォームの下にエラーの文を出します。空文字なら消します。
function setError(form, message) {
  const box = form.querySelector('.form-error');
  if (!box) return;

  box.textContent = message;
  box.hidden = !message;
}

// 選んだ写真を丸の中に出します。選んでいないときは、ぬいの顔の絵を出します。
let previewUrl = null;
function showPreview(form) {
  const file = form.photo.files && form.photo.files[0];
  const img = form.querySelector('.avatar-pick-preview');
  const face = form.querySelector('.avatar-pick-face');

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = file ? URL.createObjectURL(file) : null;

  img.hidden = !file;
  if (file) img.src = previewUrl;
  else img.removeAttribute('src');
  if (face) face.classList.toggle('hidden', Boolean(file));
}

// 「登録する」を押したときの処理です。
async function submitForm(event, form) {
  event.preventDefault(); // ブラウザーがページを再読み込みするのを止める
  setError(form, '');

  // 入力内容を FormData にまとめます（写真もここに入ります）。
  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const date = String(formData.get('last_outing_date') || '').trim();

  // 名前と日付が空なら、API に送らずに知らせます。
  if (!name || !date) {
    setError(form, '名前と「最後に連れ出した日」を入力してください。');
    return;
  }

  formData.set('name', name); // 前後の空白を除いた名前を送る

  // 写真を選んでいないときは、空のファイルを送らないようにします。
  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0) {
    formData.delete('photo');
  }

  const button = form.querySelector('button[type="submit"]');
  const buttonText = button.textContent;
  button.disabled = true; // 二重に送らないようにする
  button.textContent = '登録中…';

  try {
    // api.js の createNui() で登録します。
    // API がまだのときは、mock の動きになります。
    await createNui(formData);

    form.reset();
    showPreview(form);
    button.disabled = false;
    button.textContent = buttonText;

    // 一覧へ移動します。main.js が #nuis を見て showNuis() を呼びます。
    location.hash = '#nuis';
  } catch (error) {
    setError(form, `登録できませんでした：${error.message}`);
    button.disabled = false;
    button.textContent = buttonText;
  }
}

// #register 画面を表示します。main.js から呼ばれます。
export function showRegister() {
  const section = document.getElementById('register');
  if (!section) return;

  hidePending(section);

  // フォームは1回だけ作り、画面に戻ってきたときはそのまま使います。
  let container = section.querySelector('.register-wrap');
  if (!container) {
    container = document.createElement('div');
    container.className = 'register-wrap';
    container.innerHTML = FORM_HTML;
    (section.querySelector('.page') || section).appendChild(container);

    const form = container.querySelector('form');
    form.addEventListener('submit', (event) => submitForm(event, form));

    // 写真を選ぶまでは、丸の中にぬいの顔の絵を出しておきます。
    form.querySelector('.avatar-pick-circle').prepend(nuiFace('weak', 'avatar-pick-face'));
    form.photo.addEventListener('change', () => showPreview(form));

    // 最後に連れ出した日は、今日より後を選べないようにします。
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    form.last_outing_date.max = today.toISOString().slice(0, 10);

    // 入力し直したら、前のエラーの文を消します。
    form.addEventListener('input', () => setError(form, ''));
  }
}
