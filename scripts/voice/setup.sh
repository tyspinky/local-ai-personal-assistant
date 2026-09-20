#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 -m venv .venv-voice
.venv-voice/bin/python -m pip install -r scripts/voice/requirements.txt
.venv-voice/bin/python scripts/voice/download_model.py
