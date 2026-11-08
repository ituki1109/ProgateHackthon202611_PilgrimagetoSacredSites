// Webカメラで撮影するためのダイアログ。map.js（「ここで記録する」を押した直後）
// と register.js（ぬいの登録）の両方から使う共通の部品です。
//
// getUserMedia は HTTPS か localhost でないと使えません（スマホを LAN 経由の
// http:// で開いたときは動きません。そのときは「写真なしで記録する」を使うか、
// 記録の画面で手動で写真を選んでください）。

const DIALOG_HTML = `
  <dialog class="camera-dialog">
    <video class="camera-video" autoplay playsinline muted></video>
    <canvas class="camera-canvas" hidden></canvas>
    <p class="camera-error error" role="alert" hidden></p>
    <div class="camera-controls">
      <label class="camera-folder-pick" aria-label="フォルダーから選ぶ">
        <input type="file" accept="image/*" class="visually-hidden camera-folder-input">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M3.5 7.8a2 2 0 0 1 2-2h4l1.8 2h7a2 2 0 0 1 2 2v6.9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>
      </label>
      <button type="button" class="camera-shutter-circle" aria-label="撮影する"></button>
      <span class="camera-controls-spacer" aria-hidden="true"></span>
    </div>
    <div class="camera-actions">
      <button type="button" class="button is-block camera-skip">写真なしで進む</button>
      <button type="button" class="button is-block camera-cancel">やめる</button>
    </div>
  </dialog>
`;

let dialog = null;
let cameraStream = null;
let resolveOpen = null; // 開いている openCamera() の Promise を解決する関数

function mount() {
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.innerHTML = DIALOG_HTML;
  dialog = dialog.firstElementChild;
  document.body.appendChild(dialog);

  dialog.querySelector('.camera-shutter-circle').addEventListener('click', capturePhoto);
  dialog.querySelector('.camera-skip').addEventListener('click', () => finish(null));
  dialog.querySelector('.camera-cancel').addEventListener('click', () => finish(undefined));
  dialog.querySelector('.camera-folder-input').addEventListener('change', pickFromFolder);
  dialog.addEventListener('close', stopCamera);

  return dialog;
}

function stopCamera() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
    cameraStream = null;
  }
}

// 呼び出し元に結果を返して、ダイアログを閉じます。
// photo: File（撮影できた）、null（写真なしで進む）、undefined（やめる＝呼び出し自体をやめる）
function finish(photo) {
  const resolve = resolveOpen;
  resolveOpen = null;
  dialog.close();
  if (resolve) resolve(photo);
}

// 「フォルダーから選ぶ」で選んだ写真を、撮影した写真と同じように扱う。
function pickFromFolder(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // 次に開いたときも同じ写真を選び直せるようにする
  if (file) finish(file);
}

function capturePhoto() {
  const video = dialog.querySelector('.camera-video');
  if (!video.videoWidth) return; // 映像がまだ始まっていない

  const canvas = dialog.querySelector('.camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  canvas.toBlob((blob) => {
    if (!blob) return;
    finish(new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' }));
  }, 'image/jpeg', 0.92);
}

// getUserMedia の許可待ちを始める。openCamera() の戻り値とは切り離しておき、
// 許可プロンプトがいつまでも答えられなくても（権限なし、ブラウザー自動操作など）、
// 「撮影する」「写真なしで進む」「やめる」を待っている側をブロックしないようにする。
async function startPermission(video, errorBox) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    errorBox.textContent = 'この環境では Web カメラが使えません（https か localhost が必要です）。「写真なしで進む」を押してください。';
    errorBox.hidden = false;
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    // 待っている間にダイアログが閉じられていたら、映像を流さずすぐ止める。
    if (resolveOpen) video.srcObject = cameraStream;
    else stopCamera();
  } catch (error) {
    console.warn('[camera] カメラを開けませんでした:', error);
    errorBox.textContent = `カメラを開けませんでした（${error.message}）。権限を許可するか、「写真なしで進む」を押してください。`;
    errorBox.hidden = false;
  }
}

// カメラを開いて、撮影を待ちます。
// 戻り値: File（撮影した写真）/ null（写真なしで進む）/ undefined（やめる）。
export function openCamera() {
  const el = mount();
  const video = el.querySelector('.camera-video');
  const errorBox = el.querySelector('.camera-error');
  errorBox.hidden = true;

  el.showModal();
  startPermission(video, errorBox); // 許可を待たず、ダイアログの操作をすぐ受け付ける

  return new Promise((resolve) => {
    resolveOpen = resolve;
  });
}
