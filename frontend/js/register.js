// ぬいの登録画面（#register）を作るファイルです。
// 入力内容を api.js の createNui() に送り、成功したら一覧（#nuis）へ戻ります。

import { createNui } from './api.js';
import { nuiFace } from './ui.js';

// 登録フォームの HTML です。入力欄の名前は docs/api.md の POST /nuis に合わせています。
const FORM_HTML = `
  <form class="form register-form" novalidate>
    <div class="register-head">
      <div class="avatar-pick-wrap">
        <label class="avatar-pick">
          <input type="file" name="photo" accept="image/*" capture="environment" class="visually-hidden">
          <span class="avatar-pick-circle">
            <img class="avatar-pick-preview" alt="選んだ写真" hidden>
            <span class="avatar-pick-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M3.5 8.5h3.5l2-3h6l2 3h3.5v11h-17z"/><circle cx="12" cy="13.5" r="3.5"/></svg>
            </span>
          </span>
          <span class="avatar-pick-label">写真を選ぶ <span class="optional">任意</span></span>
        </label>
        <button type="button" class="button is-small avatar-pick-camera">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M3.5 8.5h3.5l2-3h6l2 3h3.5v11h-17z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="13.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
          Webカメラで撮る
        </button>

        <label class="field-toggle">
          <input type="checkbox" class="stylize-toggle visually-hidden" checked>
          <span class="toggle-switch" aria-hidden="true"></span>
          <span class="field-toggle-text">AIでキャラクター化する <span class="field-note">写真をイラストに描き直します</span></span>
        </label>
      </div>

      <div class="register-fields">
        <label class="field">
          <span class="field-label">名前 <span class="required">必須</span></span>
          <input type="text" name="name" maxlength="40" autocomplete="off" placeholder="例：もちもち">
        </label>

        <label class="field">
          <span class="field-label">最後に連れ出した日 <span class="required">必須</span></span>
          <input type="date" name="last_outing_date">
        </label>
      </div>
    </div>

    <p class="form-error error" role="alert" hidden></p>
    <button type="submit" class="button is-primary is-block register-seal" aria-describedby="register-seal-hint">
      <span class="register-seal-text">血判を押して登録する</span>
      <span class="register-seal-print" aria-hidden="true">
        <svg viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M24 10c-10 0-16 8-16 18M24 10c10 0 16 8 16 18"/><path d="M24 18c-6 0-10 5-10 12M24 18c6 0 10 5 10 12"/><path d="M24 26c-3 0-5 3-5 6M24 26c3 0 5 3 5 6"/></g></svg>
      </span>
    </button>
    <p id="register-seal-hint" class="register-seal-hint">ボタンを長押しで血判を押します</p>
  </form>
`;

// Webカメラの撮影ダイアログ。フォームの外（register-wrap の中）に1つだけ置きます。
const CAMERA_DIALOG_HTML = `
  <dialog class="camera-dialog">
    <video class="camera-video" autoplay playsinline muted></video>
    <canvas class="camera-canvas" hidden></canvas>
    <p class="camera-error error" role="alert" hidden></p>
    <div class="camera-actions">
      <button type="button" class="button is-primary is-block camera-shutter">撮影する</button>
      <button type="button" class="button is-block camera-cancel">やめる</button>
    </div>
  </dialog>
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

// --- Webカメラでの撮影 ---
// getUserMedia は HTTPS か localhost でないと使えません（スマホを LAN 経由の
// http:// で開いたときは動きません。その場合は「写真を選ぶ」側を使ってください）。

let cameraStream = null; // 開いている間のカメラの映像

// カメラを閉じて、映像を止めます（撮影したときも、やめたときも呼ぶ）。
function stopCamera() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
    cameraStream = null;
  }
}

// 「Webカメラで撮る」を押したときの処理です。
async function openCamera(dialog) {
  const video = dialog.querySelector('.camera-video');
  const errorBox = dialog.querySelector('.camera-error');
  errorBox.hidden = true;

  dialog.showModal();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    errorBox.textContent = 'この環境では Web カメラが使えません（https か localhost が必要です）。';
    errorBox.hidden = false;
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = cameraStream;
  } catch (error) {
    console.warn('[register] カメラを開けませんでした:', error);
    errorBox.textContent = `カメラを開けませんでした（${error.message}）。権限を許可しているか確認してください。`;
    errorBox.hidden = false;
  }
}

// 「撮影する」を押したときの処理です。映像の今の1コマを写真にして、
// 既存の <input type="file"> に入れます（送信のしくみは変えずに使うため）。
function capturePhoto(dialog, form) {
  const video = dialog.querySelector('.camera-video');
  if (!video.videoWidth) return; // 映像がまだ始まっていない

  const canvas = dialog.querySelector('.camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });

    const data = new DataTransfer();
    data.items.add(file);
    form.photo.files = data.files;
    form.photo.dispatchEvent(new Event('change', { bubbles: true }));

    dialog.close();
  }, 'image/jpeg', 0.92);
}

// 「登録する」を押したときの処理です。
async function submitForm(event, form) {
  event.preventDefault(); // ブラウザーがページを再読み込みするのを止める
  setError(form, '');

  const button = form.querySelector('button[type="submit"]');
  const textSpan = button.querySelector('.register-seal-text');
  const buttonText = textSpan ? textSpan.textContent : button.textContent;

  // 入力内容を FormData にまとめます（写真もここに入ります）。
  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const date = String(formData.get('last_outing_date') || '').trim();

  // 名前と日付が空なら、API に送らずに知らせます。
  if (!name || !date) {
    setError(form, '名前と「最後に連れ出した日」を入力してください。');
    button.classList.remove('is-sealed');
    return;
  }

  formData.set('name', name); // 前後の空白を除いた名前を送る

  // 写真を選んでいないときは、空のファイルを送らないようにします。
  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0) {
    formData.delete('photo');
  }

  // AIでキャラクター化するかどうか。チェックボックスは name を付けていないので、
  // ここで明示的に文字列にして送ります（写真がないときは API 側で無視されます）。
  const stylizeToggle = form.querySelector('.stylize-toggle');
  formData.set('stylize', stylizeToggle.checked ? 'true' : 'false');

  button.disabled = true; // 二重に送らないようにする
  if (textSpan) textSpan.textContent = '登録中…';
  else button.textContent = '登録中…';

  try {
    // api.js の createNui() で登録します。
    // API がまだのときは、mock の動きになります。
    await createNui(formData);

    form.reset();
    showPreview(form);
    button.disabled = false;
    if (textSpan) textSpan.textContent = buttonText;
    else button.textContent = buttonText;
    button.classList.remove('is-sealed');

    // 一覧へ移動します。main.js が #nuis を見て showNuis() を呼びます。
    location.hash = '#nuis';
  } catch (error) {
    setError(form, `登録できませんでした：${error.message}`);
    button.disabled = false;
    if (textSpan) textSpan.textContent = buttonText;
    else button.textContent = buttonText;
    button.classList.remove('is-sealed');
  }
}

// 血判ボタンを長押しにします。押し続けると指紋が浮かび、離さずに一定時間経つと登録されます。
function setupSealButton(form) {
  const button = form.querySelector('.register-seal');
  if (!button || button.dataset.sealBound) return () => false;
  button.dataset.sealBound = 'true';

  let timer = null;
  let sealDelayTimer = null;
  let sealed = false;

  const reset = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    button.classList.remove('is-pressing');
  };

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // すでに押印演出中なら新しい押し始めは無視
    if (button.classList.contains('is-sealed')) return;
    event.preventDefault();
    button.classList.remove('is-sealed'); // 前回の押印演出をリセット
    button.classList.add('is-pressing');
    timer = setTimeout(() => {
      sealed = true;
      button.classList.add('is-sealed');
      if (navigator.vibrate) navigator.vibrate(40);
      // 指紋を見せる猶予を置いてから送信（画面が隠れていれば送信しない）
      sealDelayTimer = setTimeout(() => {
        sealDelayTimer = null;
        if (form.offsetParent !== null) form.requestSubmit();
      }, 400);
    }, 800);
  });

  button.addEventListener('pointerup', reset);
  button.addEventListener('pointerleave', reset);
  button.addEventListener('pointercancel', reset);
  button.addEventListener('contextmenu', (event) => event.preventDefault());

  return () => {
    const wasSealed = sealed;
    sealed = false;
    // is-sealed は印を押した演出のため、次の押し始めまで残す
    return wasSealed;
  };
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
    container.innerHTML = FORM_HTML + CAMERA_DIALOG_HTML;
    (section.querySelector('.page') || section).appendChild(container);

    const form = container.querySelector('form');
    const dialog = container.querySelector('.camera-dialog');
    const takeSeal = setupSealButton(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const sealButton = form.querySelector('.register-seal');
      if (!takeSeal()) {
        setError(form, '血判を押すには、ボタンを長押ししてください。');
        sealButton.classList.remove('is-sealed');
        return;
      }
      submitForm(event, form);
    });

    // 写真を選ぶまでは、丸の中にぬいの顔の絵を出しておきます。
    form.querySelector('.avatar-pick-circle').prepend(nuiFace('weak', 'avatar-pick-face'));
    form.photo.addEventListener('change', () => showPreview(form));

    // Webカメラでの撮影。どう閉じても（撮影、やめる、Esc）カメラは必ず止める。
    form.querySelector('.avatar-pick-camera').addEventListener('click', () => openCamera(dialog));
    dialog.querySelector('.camera-shutter').addEventListener('click', () => capturePhoto(dialog, form));
    dialog.querySelector('.camera-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', stopCamera);

    // 最後に連れ出した日は、今日より後を選べないようにします。
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    form.last_outing_date.max = today.toISOString().slice(0, 10);

    // 入力し直したら、前のエラーの文を消します。
    form.addEventListener('input', () => setError(form, ''));
  }
}
