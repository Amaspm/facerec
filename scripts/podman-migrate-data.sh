#!/usr/bin/env bash
# Salin data existing (absensi.db, faces_data.pkl) ke volume Podman
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# podman-compose prefix nama project dari folder deploy → deploy_facerec-data
VOLUME_NAME="${1:-deploy_facerec-data}"

copy_if_exists() {
  local src="$1"
  local dest_name="$2"
  if [[ -f "${src}" ]]; then
    echo "Menyalin ${src} → volume:${dest_name}"
    podman run --rm \
      -v "${VOLUME_NAME}:/data" \
      -v "${src}:/src/${dest_name}:ro" \
      docker.io/library/alpine:3.20 \
      sh -c "cp /src/${dest_name} /data/${dest_name} && ls -la /data/"
  else
    echo "Lewati (tidak ada): ${src}"
  fi
}

echo "=== Migrasi data ke volume '${VOLUME_NAME}' ==="
copy_if_exists "${ROOT_DIR}/absensi.db" "absensi.db"
copy_if_exists "${ROOT_DIR}/faces_data.pkl" "faces_data.pkl"
echo "Selesai."
