"""Loopback-only OpenAI-compatible Piper service for Javis.

Only explicitly allowed browser origins may synthesize; no credentials, text,
recordings, or generated speech are retained by the service.
"""
import io
import json
import math
import os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import BoundedSemaphore
import wave

MODEL = Path(__file__).resolve().parents[2] / '.local/voice/jarvis-high/jarvis-high.onnx'
PORT = int(os.environ.get('JAVIS_VOICE_PORT', '7861'))
ORIGINS = set(os.environ.get('JAVIS_VOICE_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(','))
SYNTHESIS = BoundedSemaphore(1)

def validate_payload(body):
    if not isinstance(body, dict):
        raise ValueError('Expected a JSON object.')
    text = body.get('input')
    speed = body.get('speed', 1)
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValueError('Speech text must contain 1–4000 characters.')
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not math.isfinite(speed) or not .5 <= speed <= 2:
        raise ValueError('Speed must be between 0.5 and 2.')
    if body.get('voice', 'jarvis-high') not in ('jarvis-high', 'jarvis', ''):
        raise ValueError('This service provides the jarvis-high voice.')
    if body.get('response_format', 'wav') != 'wav':
        raise ValueError('This service returns WAV audio.')
    return text.strip(), speed

class VoiceServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class Handler(BaseHTTPRequestHandler):
    server_version = 'JavisVoice/1.0'
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def allowed(self):
        return self.headers.get('Host') in {f'localhost:{PORT}', f'127.0.0.1:{PORT}'} and (not self.headers.get('Origin') or self.headers.get('Origin') in ORIGINS)

    def respond(self, status, payload, content_type='application/json'):
        data = json.dumps(payload).encode() if content_type == 'application/json' else payload
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The owner interrupted playback or navigated away.

    def do_OPTIONS(self):
        if not self.allowed():
            self.respond(403, {'error':'Origin or host is not allowed.'})
            return
        self.respond(204, b'', 'text/plain')

    def do_GET(self):
        if not self.allowed():
            self.respond(403, {'error':'Origin or host is not allowed.'})
        elif self.path == '/health':
            self.respond(200, {'status':'ready','provider':'piper','voice':'jarvis-high','local':True})
        else:
            self.respond(404, {'error':'Not found.'})

    def do_POST(self):
        if not self.allowed():
            self.respond(403, {'error':'Origin or host is not allowed.'})
            return
        if self.path != '/v1/audio/speech':
            self.respond(404, {'error':'Not found.'})
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.respond(415, {'error':'Use application/json.'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 20000:
                raise ValueError('Invalid request size.')
            text, speed = validate_payload(json.loads(self.rfile.read(size)))
        except (ValueError, UnicodeDecodeError):
            self.respond(400, {'error':'Invalid speech request: use 1–4000 characters, jarvis-high voice, and speed 0.5–2.'})
            return
        if not SYNTHESIS.acquire(blocking=False):
            self.respond(429, {'error':'Voice is busy. Please try again.'})
            return
        try:
            from piper import SynthesisConfig
            output = io.BytesIO()
            with wave.open(output, 'wb') as wav:
                self.server.voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1 / speed))
            self.respond(200, output.getvalue(), 'audio/wav')
        except Exception:
            self.respond(500, {'error':'Local speech synthesis failed.'})
        finally:
            SYNTHESIS.release()

    def log_message(self, format, *args):
        # Never log request text or bodies.
        pass

def main():
    from piper import PiperVoice
    if not MODEL.exists():
        raise SystemExit('Voice model missing. Run npm run voice:setup first.')
    server = VoiceServer(('127.0.0.1', PORT), Handler)
    print('Loading J.A.R.V.I.S. high-quality voice…', flush=True)
    server.voice = PiperVoice.load(str(MODEL))
    # Warm the inference path before advertising readiness.
    with wave.open(io.BytesIO(), 'wb') as wav:
        server.voice.synthesize_wav('Ready.', wav)
    print(f'Javis voice ready: http://127.0.0.1:{PORT}/v1/audio/speech', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
