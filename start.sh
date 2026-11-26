#!/usr/bin/env bash
set -euo pipefail

if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
fi

exec .venv/bin/python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
