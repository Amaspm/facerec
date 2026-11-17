#!/usr/bin/env bash
# Jalankan unit test (Minggu 2–3 migrasi web)
# Gunakan: bash scripts/run_tests.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -d "venv/bin" ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
fi

pip install -q -r requirements-dev.txt

echo "=== Unit Tests ==="
python3 -m pytest tests/ -v

