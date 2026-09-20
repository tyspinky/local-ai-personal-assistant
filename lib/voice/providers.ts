export type VoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'offline'
  | 'locked'
  | 'approval';
export type VoiceSettings = {
  provider: 'browser' | 'kokoro' | 'piper';
  endpoint: string;
  voice: string;
  speed: number;
  pitch: number;
  volume: number;
  autoSpeak: boolean;
  browserRecognition: boolean;
};
export const defaultVoiceSettings: VoiceSettings = {
  provider: 'piper',
  endpoint: 'http://127.0.0.1:7861/v1/audio/speech',
  voice: 'jarvis-high',
  speed: 1,
  pitch: 1,
  volume: 0.8,
  autoSpeak: true,
  browserRecognition: false,
};
export function localEndpoint(value: string) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use a loopback local voice endpoint without credentials.');
  return url.toString();
}
export function spokenText(text: string) {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' Code is available on screen. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*#_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];
  let result = '';
  for (const sentence of sentences) {
    if ((result + sentence).length > 650) break;
    result += sentence;
  }
  return result.trim() || clean.slice(0, 650);
}
export interface TTSProvider {
  speak(
    text: string,
    settings: VoiceSettings,
    signal: AbortSignal,
  ): Promise<void>;
}
export class BrowserTTS implements TTSProvider {
  speak(text: string, settings: VoiceSettings, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech output is unavailable in this browser.'));
        return;
      }
      if (signal.aborted) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice =
        speechSynthesis.getVoices().find((v) => v.name === settings.voice) ??
        null;
      utterance.rate = settings.speed;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;
      const stop = () => {
        speechSynthesis.cancel();
        finish();
      };
      const finish = (error?: Error) => {
        signal.removeEventListener('abort', stop);
        if (error) reject(error);
        else resolve();
      };
      utterance.onend = () => finish();
      utterance.onerror = (e) =>
        finish(
          e.error === 'canceled' || e.error === 'interrupted'
            ? undefined
            : new Error(e.error),
        );
      signal.addEventListener('abort', stop, { once: true });
      speechSynthesis.speak(utterance);
    });
  }
}
export class LocalTTS implements TTSProvider {
  async speak(text: string, settings: VoiceSettings, signal: AbortSignal) {
    const response = await fetch(localEndpoint(settings.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.provider === 'kokoro' ? 'kokoro' : 'piper',
        input: text,
        voice:
          settings.voice ||
          (settings.provider === 'piper' ? 'jarvis-high' : 'af_heart'),
        speed: settings.speed,
        response_format: 'wav',
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      credentials: 'omit',
      redirect: 'error',
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('audio/')
    )
      throw new Error('Local voice offline');
    const url = URL.createObjectURL(await response.blob());
    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.volume = settings.volume;
        const finish = (error?: Error) => {
          signal.removeEventListener('abort', stop);
          audio.pause();
          audio.src = '';
          if (error) reject(error);
          else resolve();
        };
        const stop = () => finish();
        if (signal.aborted) {
          finish();
          return;
        }
        signal.addEventListener('abort', stop, { once: true });
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error('Local audio playback failed'));
        void audio.play().catch((error) => finish(error));
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
export class PlaybackQueue {
  private controller = new AbortController();
  private pending = Promise.resolve();
  stop() {
    this.controller.abort();
    this.controller = new AbortController();
    this.pending = Promise.resolve();
  }
  enqueue(text: string, settings: VoiceSettings, fallback: () => void) {
    const signal = this.controller.signal;
    const next = this.pending.then(async () => {
      if (signal.aborted) return;
      if (settings.provider !== 'browser') {
        try {
          await new LocalTTS().speak(text, settings, signal);
          return;
        } catch {
          if (signal.aborted) return;
          fallback();
        }
      }
      await new BrowserTTS().speak(text, settings, signal);
    });
    this.pending = next.catch(() => {});
    return next;
  }
}
export interface STTProvider {
  start(
    onText: (text: string) => void,
    onEnd: () => void,
    onError: (message: string) => void,
  ): void;
  stop(): void;
  abort(): void;
}
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export class BrowserSTT implements STTProvider {
  private recognition?: Recognition;
  start(
    onText: (text: string) => void,
    onEnd: () => void,
    onError: (message: string) => void,
  ) {
    const host = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Constructor)
      throw new Error(
        'Speech recognition is unavailable. Use typed input or a supported browser.',
      );
    const recognition = new Constructor();
    this.recognition = recognition;
    recognition.lang = navigator.language || 'en-GB';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) =>
      onText(
        Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(' '),
      );
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = undefined;
      onEnd();
    };
    recognition.onerror = (event) => {
      if (this.recognition === recognition) this.recognition = undefined;
      onError(`Microphone: ${event.error}`);
    };
    recognition.start();
  }
  stop() {
    try {
      this.recognition?.stop();
    } catch {
      this.recognition = undefined;
    }
  }
  abort() {
    if (this.recognition) {
      const recognition = this.recognition;
      this.recognition = undefined;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        recognition.abort();
      } catch {
        /* Some browsers throw when aborting an already-ended recognizer. */
      }
    }
  }
}
