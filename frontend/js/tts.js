// ぬいのセリフを、VOICEVOX（ローカルで起動しておくアプリ）で読み上げます。
//
// 本番前に VOICEVOX アプリを起動しておいてください（エンジンが
// http://localhost:50021 で待ち受けます）。docs/design.md の「構成」には
// ないツールなので、使う前にチームに一声かけてください。
//
// 起動していない・失敗したときは、コンソールに警告を出すだけで黙って
// 諦めます（読み上げがなくても、アプリ自体は今まで通り動きます）。

const ENGINE_URL = 'http://localhost:50021';
const SPEAKER_ID = 3; // ずんだもん・ノーマル

let currentAudio = null;

// セリフ（text）を読み上げます。前のセリフが鳴っている途中なら止めてから読みます。
export async function speakLine(text) {
  if (!text) return;

  try {
    const query = await fetchJson(
      `${ENGINE_URL}/audio_query?speaker=${SPEAKER_ID}&text=${encodeURIComponent(text)}`,
      { method: 'POST' },
    );

    const synthRes = await fetch(`${ENGINE_URL}/synthesis?speaker=${SPEAKER_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    if (!synthRes.ok) throw new Error(`synthesis に失敗しました（${synthRes.status}）`);
    const blob = await synthRes.blob();

    if (currentAudio) {
      currentAudio.pause();
      URL.revokeObjectURL(currentAudio.src);
    }
    currentAudio = new Audio(URL.createObjectURL(blob));
    await currentAudio.play();
  } catch (err) {
    // VOICEVOX が起動していないときによく起きる（fetch 自体が失敗する）。
    console.warn('[tts] 読み上げに失敗しました（VOICEVOXアプリが起動していないかも）:', err.message);
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} に失敗しました（${res.status}）`);
  return res.json();
}
