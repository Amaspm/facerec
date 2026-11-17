#!/usr/bin/env bash
# Jalankan frontend dev server (Minggu 3 migrasi web)
set -euo pipefail
cd "$(dirname "$0")/../frontend"

if [ ! -d "node_modules" ]; then
  npm install
fi

echo "Frontend: http://127.0.0.1:5173"
echo "Pastikan backend API berjalan di http://127.0.0.1:8000"
exec npm run dev -- --host 127.0.0.1
