// ぬいのセリフの読み上げ。
//
// セリフは決まった定型文（haunt.js の VOICES、ui.js の grudgeStage().line）
// なので、本番中に VOICEVOX を呼ぶのではなく、あらかじめ VOICEVOX
// （ずんだもん・ノーマル）で作っておいた音声ファイルを再生するだけにしてある。
// こうすると、本番で VOICEVOX アプリを起動しておく必要がなくなる。
//
// セリフの文面を変えたときは、audio/voice/ の該当ファイルも作り直すこと
// （VOICEVOXアプリを起動した状態で、/audio_query → /synthesis を呼んで作る）。

const VOICE_FILES = {
  'どこ見てるの': 'audio/voice/look_away.wav',
  'こっちを見て': 'audio/voice/come_here.wav',
  'ずっと待ってたのに': 'audio/voice/waited.wav',
  'そこじゃない': 'audio/voice/not_there.wav',
  '連れて行ってくれるよね': 'audio/voice/take_me.wav',
  'ねえ、聞いてる？': 'audio/voice/listening.wav',
  'もう、逃がさない': 'audio/voice/wont_let_go.wav',
  'また連れてってね': 'audio/voice/calm.wav',
  '…許してあげてもいいよ': 'audio/voice/weak.wav',
  '最近ずっと置いていくよね': 'audio/voice/medium.wav',
  '放置してゆるさない…': 'audio/voice/strong.wav',
};

let currentAudio = null;

// セリフ（text）を読み上げます。用意していない文のときは、何もしません。
export function speakLine(text) {
  const src = VOICE_FILES[text];
  if (!src) return;

  if (currentAudio) currentAudio.pause();
  currentAudio = new Audio(src);
  currentAudio.play().catch((err) => {
    // ブラウザーの自動再生ブロックなどで起きる。最初の操作のあとは鳴る。
    console.warn('[tts] 読み上げを再生できませんでした:', err.message);
  });
}
