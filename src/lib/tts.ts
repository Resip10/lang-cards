import { cleanTerm } from './answer';

// Uses the browser's built-in speech synthesis: free, offline once the voice is installed.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export const ttsSupported = () => !!synth;

export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

export const voicesFor = (voices: SpeechSynthesisVoice[], tts: string) => {
  const base = tts.split('-')[0].toLowerCase();
  return voices.filter((v) => v.lang.replace('_', '-').toLowerCase().split('-')[0] === base);
};

/** Card text → something pleasant to hear: no grammar notation, "/" becomes a pause. */
export const speakable = (s: string) => cleanTerm(s).replace(/\s*\/\s*/g, ', ');

export async function speak(text: string, lang: string, rate = 0.9, voiceURI?: string) {
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.lang = lang;
  u.rate = rate;
  const voices = voicesFor(await getVoices(), lang);
  const voice = voices.find((v) => v.voiceURI === voiceURI) ?? voices.find((v) => v.localService) ?? voices[0];
  if (voice) u.voice = voice;
  synth.speak(u);
}

export const stopSpeaking = () => synth?.cancel();
