"""Fetch only the pinned ONNX inference model and config, never checkpoints."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / '.local' / 'voice' / 'jarvis-high'
REVISION = '37f8763122312665f091d1fc760abaf1f79b02cc'
BASE = f'https://huggingface.co/jgkawell/jarvis/resolve/{REVISION}/en/en_GB/jarvis/high'
FILES = {
    'jarvis-high.onnx': ('sha256', '9791877d9c099fabbf30be2825e011451c39b3431e21e81e866f5b6507e72993'),
    'jarvis-high.onnx.json': ('git', '43da3808534a11a0f4fd8fbe27d5aaa5cc14f0f0'),
}

def valid(path, kind, expected):
    if not path.exists():
        return False
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest() if kind == 'sha256' else hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
    return digest == expected

def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, (kind, expected) in FILES.items():
        target = MODEL_DIR / name
        if valid(target, kind, expected):
            print(f'Verified: {name}')
            continue
        partial = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '--fail', '--location', '--retry', '3', '--max-time', '300', '--output', str(partial), f'{BASE}/{name}'], check=True)
        if not valid(partial, kind, expected):
            partial.unlink(missing_ok=True)
            raise RuntimeError(f'Model checksum mismatch: {name}')
        partial.replace(target)
        print(f'Downloaded and verified: {name}')
    (MODEL_DIR / 'provenance.json').write_text(json.dumps({'source':'https://huggingface.co/jgkawell/jarvis','revision':REVISION,'files':FILES}, indent=2))

if __name__ == '__main__':
    main()
