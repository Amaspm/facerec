#!/usr/bin/env bash
# Build & jalankan stack Podman (Minggu 5)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/compose.yaml"

cd "${ROOT_DIR}"

# Generate TLS certs jika belum ada
bash "${DEPLOY_DIR}/generate-certs.sh"

# Load env (port mapping)
if [[ -f "${DEPLOY_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${DEPLOY_DIR}/.env"
  set +a
fi

HTTP_PORT="${HTTP_PORT:-8080}"
HTTPS_PORT="${HTTPS_PORT:-8443}"

COMPOSE_CMD=""
if command -v podman-compose &>/dev/null; then
  COMPOSE_CMD="podman-compose"
elif podman compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="podman compose"
else
  echo "Error: podman compose / podman-compose tidak ditemukan."
  exit 1
fi

echo "=== Build & start containers ==="
${COMPOSE_CMD} -f "${COMPOSE_FILE}" up -d --build

echo ""
echo "=== Stack berjalan ==="
echo "  Frontend (HTTPS): https://localhost:${HTTPS_PORT}"
echo "  Frontend (HTTP):  http://localhost:${HTTP_PORT}  → redirect ke HTTPS"
echo "  API health:       https://localhost:${HTTPS_PORT}/api/health"
echo "  Swagger:          https://localhost:${HTTPS_PORT}/docs"
echo ""
echo "Perintah berguna:"
echo "  ${COMPOSE_CMD} -f deploy/compose.yaml logs -f"
echo "  ${COMPOSE_CMD} -f deploy/compose.yaml down"
echo "  ./scripts/podman-integration-test.sh"
