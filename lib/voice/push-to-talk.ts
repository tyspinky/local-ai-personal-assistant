import type { STTProvider } from './providers';

type Callbacks = {
  transcript: (text: string) => void;
  state: (state: 'idle' | 'listening' | 'transcribing') => void;
  submit: (text: string) => void;
  error: (message: string) => void;
};

/** One press/release produces at most one submitted transcript.
 * stop() requests the recognizer's final result; abort() discards the turn.
 */
export class PushToTalkSession {
  private generation = 0;
  private active = false;
  private released = false;
  private ended = false;
  private text = '';
  private timer?: ReturnType<typeof setTimeout>;

  private provider: STTProvider;
  private callbacks: Callbacks;
  private timeoutMs: number;
  constructor(provider: STTProvider, callbacks: Callbacks, timeoutMs = 8000) {
    this.provider = provider;
    this.callbacks = callbacks;
    this.timeoutMs = timeoutMs;
  }

  start() {
    this.cancel();
    const generation = this.generation;
    this.active = true;
    this.released = false;
    this.ended = false;
    this.text = '';
    this.callbacks.transcript('');
    this.callbacks.state('listening');
    const current = () => this.active && generation === this.generation;
    try {
      this.provider.start(
        (text) => {
          if (current()) {
            this.text = text;
            this.callbacks.transcript(text);
          }
        },
        () => {
          if (!current()) return;
          this.ended = true;
          if (this.released) this.finish();
          else this.callbacks.state('transcribing');
        },
        (message) => {
          if (current()) this.fail(message);
        },
      );
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : 'Microphone unavailable.',
      );
    }
  }

  release() {
    if (!this.active || this.released) return;
    this.released = true;
    if (this.ended) {
      this.finish();
      return;
    }
    this.callbacks.state('transcribing');
    this.timer = setTimeout(
      () =>
        this.fail(
          'Transcription timed out. Your text is still available to edit or send.',
        ),
      this.timeoutMs,
    );
    try {
      this.provider.stop();
    } catch {
      this.fail('Could not finish transcription. Please try again.');
    }
  }

  cancel() {
    this.generation++;
    this.active = false;
    clearTimeout(this.timer);
    try {
      this.provider.abort();
    } catch {
      /* Browser recognizers can throw when an old session is already closed. */
    }
  }

  private finish() {
    clearTimeout(this.timer);
    this.active = false;
    this.callbacks.state('idle');
    const text = this.text.trim();
    if (text) this.callbacks.submit(text);
    else
      this.callbacks.error(
        'I didn’t catch anything. Hold to talk and try again.',
      );
  }

  private fail(message: string) {
    this.cancel();
    this.callbacks.state('idle');
    this.callbacks.error(message);
  }
}
