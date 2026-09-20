"""Contract tests with a mock synthesizer; never access owner data."""
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
import wave

spec = importlib.util.spec_from_file_location('javis_voice', Path(__file__).resolve().parents[1] / 'scripts/voice/server.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)

class FakeVoice:
    def synthesize_wav(self, text, wav, syn_config=None):
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b'\0\0' * 2205)

class VoiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = service.VoiceServer(('127.0.0.1', 0), service.Handler)
        service.PORT = cls.server.server_port
        cls.server.voice = FakeVoice()
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{service.PORT}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, body=None, origin='http://localhost:3000', path='/v1/audio/speech', method='POST', content_type='application/json', host=None):
        headers={'Origin':origin,'Content-Type':content_type}
        if host:headers['Host']=host
        request=urllib.request.Request(self.url+path, data=json.dumps(body or {'input':'Hello','voice':'jarvis-high'}).encode() if method=='POST' else None, headers=headers,method=method)
        try:response=urllib.request.urlopen(request,timeout=5)
        except urllib.error.HTTPError as error:response=error
        self.addCleanup(response.close)
        return response

    def test_audio_contract_and_cors(self):
        response=self.request()
        self.assertEqual(response.status,200)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'],'http://localhost:3000')
        self.assertEqual(response.headers['Content-Type'],'audio/wav')
        with wave.open(io.BytesIO(response.read())) as wav:self.assertEqual(wav.getnframes(),2205)

    def test_untrusted_origin_and_rebinding_host_rejected(self):
        self.assertEqual(self.request(origin='https://unrelated.example').status,403)
        self.assertEqual(self.request(origin='null').status,403)
        self.assertEqual(self.request(host=f'attacker.example:{service.PORT}').status,403)

    def test_preflight_and_health(self):
        self.assertEqual(self.request(method='OPTIONS').status,204)
        response=self.request(method='GET',path='/health')
        self.assertEqual(json.load(response)['voice'],'jarvis-high')

    def test_bad_requests(self):
        for body in [{'input':''},{'input':'x'*4001},{'input':'Hello','speed':False},{'input':'Hello','speed':float('nan')},{'input':'Hello','voice':'other'},{'input':'Hello','response_format':'mp3'}]:
            self.assertEqual(self.request(body).status,400)
        self.assertEqual(self.request(content_type='text/plain').status,415)
        self.assertEqual(self.request(path='/other').status,404)

    def test_busy_service_does_not_queue_unbounded_work(self):
        service.SYNTHESIS.acquire()
        try:self.assertEqual(self.request().status,429)
        finally:service.SYNTHESIS.release()

if __name__ == '__main__':unittest.main()
