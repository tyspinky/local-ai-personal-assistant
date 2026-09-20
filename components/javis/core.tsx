'use client';
import { useEffect, useRef, useState } from 'react';
import { PushToTalkSession } from '@/lib/voice/push-to-talk';
import {
  Mic,
  Square,
  Volume2,
  Send,
  AudioLines,
  ShieldCheck,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  BrowserSTT,
  PlaybackQueue,
  defaultVoiceSettings,
  spokenText,
  type VoiceSettings,
  type VoiceState,
} from '@/lib/voice/providers';

export function CoreOrb({ state }: { state: VoiceState }) {
  return (
    <div className={`core-orbit state-${state}`} aria-label={`Javis ${state}`}>
      <div className="orb-axis axis-x" />
      <div className="orb-axis axis-y" />
      <div className="orbit orbit-outer" />
      <div className="orbit orbit-ticks" />
      <div className="orbit orbit-middle" />
      <div className="orbit orbit-inner" />
      <div className="orbit orbit-pulse" />
      <div className="core-nucleus">
        <span className="core-eyebrow">PERSONAL INTELLIGENCE</span>
        <strong>JAVIS</strong>
        <span className="core-state">
          {state === 'idle' ? 'AWAITING YOUR COMMAND' : state.toUpperCase()}
        </span>
        <div className="voice-bars" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${8 + Math.sin(i * 1.9) ** 2 * 25}px`,
                animationDelay: `${i * -0.09}s`,
              }}
            />
          ))}
        </div>
      </div>
      <span className="orb-coordinate coord-a">
        VOICE / {state.toUpperCase()}
      </span>
      <span className="orb-coordinate coord-b">CORE / V2.0</span>
    </div>
  );
}
export function JavisCore({
  chat,
  setChat,
  reply,
  thinking,
  offline,
  approval,
  send,
  onVoiceChange,
}: {
  chat: string;
  setChat: (text: string) => void;
  reply: string;
  thinking: boolean;
  offline: boolean;
  approval: boolean;
  send: (voice?: boolean, transcript?: string) => Promise<string | undefined>;
  onVoiceChange: (active: boolean) => void;
}) {
  const [settings, setSettings] = useState<VoiceSettings>(defaultVoiceSettings);
  const [state, setState] = useState<VoiceState>('idle');
  const [notice, setNotice] = useState(
    'Push-to-talk is off. Enable the browser fallback in voice settings.',
  );
  const [voices, setVoices] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const [localVoice, setLocalVoice] = useState('Checking local voice…');
  useEffect(() => {
    if (
      settings.provider !== 'piper' ||
      settings.endpoint !== 'http://127.0.0.1:7861/v1/audio/speech'
    )
      return;
    const controller = new AbortController();
    void fetch('http://127.0.0.1:7861/health', {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
    })
      .then((response) => {
        if (!controller.signal.aborted)
          setLocalVoice(
            response.ok
              ? 'J.A.R.V.I.S. voice ready · local'
              : 'Local voice offline · browser fallback',
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLocalVoice('Local voice offline · browser fallback');
      });
    return () => controller.abort();
  }, [settings.provider, settings.endpoint]);
  const queue = useRef(new PlaybackQueue());
  const stt = useRef(new BrowserSTT());
  const generation = useRef(0);
  const voiceSession = useRef<PushToTalkSession | null>(null);
  const submitRef = useRef<
    ((fromVoice: boolean, transcript: string) => Promise<void>) | null
  >(null);
  useEffect(() => {
    const session = new PushToTalkSession(stt.current, {
      transcript: setChat,
      state: setState,
      submit: (text) => {
        void submitRef.current?.(true, text);
      },
      error: setNotice,
    });
    voiceSession.current = session;
    return () => session.cancel();
  }, [setChat]);
  const recognized = useRef(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    let alive = true;
    void fetch('/api/javis/v2')
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ voice?: VoiceSettings }>)
          : Promise.reject(),
      )
      .then((data) => {
        if (alive && data.voice)
          setSettings({ ...defaultVoiceSettings, ...data.voice });
      })
      .catch(() => {
        if (alive) setSaved('Voice preferences could not be loaded.');
      });
    const update = () =>
      setVoices(window.speechSynthesis?.getVoices().map((v) => v.name) ?? []);
    update();
    window.speechSynthesis?.addEventListener('voiceschanged', update);
    const playback = queue.current;
    const recognition = stt.current;
    const lifecycle = generation;
    return () => {
      alive = false;
      lifecycle.current++;
      playback.stop();
      recognition.abort();
      window.speechSynthesis?.removeEventListener('voiceschanged', update);
    };
  }, []);
  const event = async (action: string) => {
    try {
      await fetch('/api/javis/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'voice.event', action }),
      });
    } catch {
      /* Playback remains usable when audit transport fails. */
    }
  };
  const speak = async (text: string) => {
    voiceSession.current?.cancel();
    queue.current.stop();
    const current = ++generation.current;
    setState('speaking');
    try {
      await queue.current.enqueue(spokenText(text), settingsRef.current, () =>
        setNotice('Local voice offline. Using browser speech.'),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Voice unavailable');
    } finally {
      if (current === generation.current) setState('idle');
    }
  };
  const interrupt = () => {
    generation.current++;
    queue.current.stop();
    voiceSession.current?.cancel();
    setState('idle');
    void event('interrupt');
  };
  const submit = async (fromVoice = false, transcript?: string) => {
    if (thinking || state === 'thinking' || !(transcript ?? chat).trim())
      return;
    interrupt();
    const turn = generation.current;
    setState('thinking');
    setNotice('On it.');
    try {
      const answer = await send(fromVoice, transcript);
      if (turn !== generation.current) return;
      if (answer && (fromVoice || settingsRef.current.autoSpeak))
        await speak(answer);
      else setState('idle');
    } catch {
      if (turn === generation.current) {
        setNotice('Could not send your message. Please try again.');
        setState('idle');
      }
    }
  };
  const listen = () => {
    if (!settings.browserRecognition || thinking || state === 'thinking')
      return;
    interrupt();
    recognized.current = true;
    onVoiceChange(true);
    setNotice('Listening. Release to send — Javis will answer aloud.');
    voiceSession.current?.start();
    void event('listen');
  };
  useEffect(() => {
    submitRef.current = submit;
  });
  const visibleState = approval
    ? 'approval'
    : thinking
      ? 'thinking'
      : state === 'idle' && offline
        ? 'offline'
        : state;
  return (
    <section className={`command-core state-${visibleState}`}>
      <div className="panel-heading">
        <span>
          <AudioLines size={14} /> ASSISTANT CORE
        </span>
        <span className="live-label">{visibleState}</span>
      </div>
      <div className="core-stage">
        <div className="core-topline">
          <span>LOCAL PROCESSING</span>
          <span>OWNER CHANNEL</span>
        </div>
        <CoreOrb state={visibleState} />
        <div className="core-bottomline">
          <span>
            <ShieldCheck size={12} /> APPROVAL GATED
          </span>
          <span>WAKE MODE / DISABLED</span>
        </div>
      </div>
      <div className="comms">
        <div className="comms-label">
          <span className="status-dot" /> JAVIS <span>COMMS CHANNEL / 01</span>
          <button
            aria-label="Read reply aloud"
            onClick={() => void speak(reply)}
            disabled={thinking}
          >
            <Volume2 size={15} />
          </button>
        </div>
        <p aria-live="polite">{reply}</p>
      </div>
      <div className="command-input">
        <Textarea
          aria-label="Message Javis"
          value={chat}
          onChange={(e) => {
            setChat(e.target.value);
            recognized.current = false;
            onVoiceChange(false);
          }}
          placeholder="Talk to me. What are we working on?"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!thinking && chat.trim()) {
                void submit(recognized.current);
              }
            }
          }}
        />
        <Button
          aria-label="Send message"
          disabled={thinking || !chat.trim()}
          onClick={() => {
            void submit(recognized.current);
          }}
        >
          <Send size={17} />
        </Button>
      </div>
      <div className="voice-controls">
        <Button
          disabled={!settings.browserRecognition || thinking}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            listen();
          }}
          onPointerUp={() => voiceSession.current?.release()}
          onPointerCancel={interrupt}
          onLostPointerCapture={() => voiceSession.current?.release()}
          onBlur={() => voiceSession.current?.release()}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              listen();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              voiceSession.current?.release();
            }
          }}
        >
          <Mic size={16} /> Hold to talk
        </Button>
        <Button variant="outline" onClick={interrupt}>
          <Square size={13} /> Stop voice
        </Button>
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="ghost" aria-label="Voice settings">
                <Settings2 size={16} />
              </Button>
            }
          />
          <DialogContent className="voice-dialog">
            <DialogHeader>
              <DialogTitle>Voice configuration</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-400">
              Browser recognition can send audio to its vendor. Enable it only
              if you accept that fallback. Wake mode remains disabled.
            </p>
            <label>
              Output provider
              <select
                value={settings.provider}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    provider: e.target.value as VoiceSettings['provider'],
                    voice:
                      e.target.value === 'piper'
                        ? 'jarvis-high'
                        : e.target.value === 'kokoro'
                          ? 'af_heart'
                          : '',
                    endpoint:
                      e.target.value === 'piper'
                        ? 'http://127.0.0.1:7861/v1/audio/speech'
                        : 'http://localhost:7860/v1/audio/speech',
                  })
                }
              >
                <option value="browser">Browser speech</option>
                <option value="kokoro">Kokoro · local HTTP</option>
                <option value="piper">J.A.R.V.I.S. · local Piper</option>
              </select>
            </label>
            {settings.provider !== 'browser' && (
              <label>
                Local speech endpoint
                <input
                  value={settings.endpoint}
                  onChange={(e) =>
                    setSettings({ ...settings, endpoint: e.target.value })
                  }
                />
              </label>
            )}
            <label>
              Voice name
              <input
                list="voice-names"
                value={settings.voice}
                placeholder={
                  settings.provider === 'browser'
                    ? 'System default'
                    : settings.provider === 'piper'
                      ? 'jarvis-high'
                      : 'af_heart'
                }
                onChange={(e) =>
                  setSettings({ ...settings, voice: e.target.value })
                }
              />
              <datalist id="voice-names" aria-label="Available voices">
                {voices.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </datalist>
            </label>
            {(['speed', 'pitch', 'volume'] as const).map((key) => (
              <label key={key}>
                {key} <span>{settings[key].toFixed(1)}</span>
                <input
                  type="range"
                  min={key === 'volume' ? 0 : 0.5}
                  max={key === 'volume' ? 1 : 2}
                  step="0.1"
                  value={settings[key]}
                  onChange={(e) =>
                    setSettings({ ...settings, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <p className="text-xs text-slate-400">
              Pitch applies to browser speech. Local voices use the server’s
              pitch.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.autoSpeak}
                onChange={(e) =>
                  setSettings({ ...settings, autoSpeak: e.target.checked })
                }
              />{' '}
              Speak typed replies automatically
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.browserRecognition}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    browserRecognition: e.target.checked,
                  })
                }
              />{' '}
              Allow browser speech recognition fallback
            </label>
            <Button
              onClick={() =>
                void speak(
                  'Good evening. All systems are ready. What shall we work on first?',
                )
              }
            >
              Test voice
            </Button>
            <Button
              onClick={async () => {
                try {
                  const response = await fetch('/api/javis/v2', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'voice.settings', settings }),
                  });
                  const data = (await response.json()) as { error: string };
                  setSaved(
                    response.ok ? 'Voice preferences saved.' : data.error,
                  );
                } catch {
                  setSaved('Could not save preferences.');
                }
              }}
            >
              Save preferences
            </Button>
            <output>{saved}</output>
          </DialogContent>
        </Dialog>
      </div>
      <output className="voice-notice">
        {settings.provider === 'piper' &&
        settings.endpoint === 'http://127.0.0.1:7861/v1/audio/speech' ? (
          <>
            {localVoice}
            <br />
          </>
        ) : null}
        {notice}
      </output>
    </section>
  );
}
