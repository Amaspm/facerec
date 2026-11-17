#!/usr/bin/env bash
# Jalankan backend API (Minggu 1 migrasi web)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d "venv/bin" ]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
fi

python3 -m pip install -q -r requirements-web.txt
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
