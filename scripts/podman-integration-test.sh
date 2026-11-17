#!/usr/bin/env bash
# Integration test stack Podman (Minggu 5 & 6)
# Gunakan: bash scripts/podman-integration-test.sh
set -uo pipefail
# Sengaja tidak pakai -e agar semua check bisa berjalan meski ada yang gagal.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"

if [[ -f "${DEPLOY_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${DEPLOY_DIR}/.env"
  set +a
fi

HTTPS_PORT="${HTTPS_PORT:-8443}"
HTTP_PORT="${HTTP_PORT:-8080}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
BASE_URL="https://localhost:${HTTPS_PORT}"

pass=0
fail=0

# Helper: fetch URL dan periksa pattern
# fetch_check <desc> <url> <pattern> [case_insensitive=0|1] [extra_curl_args...]
fetch_check() {
  local desc="$1"
  local url="$2"
  local pattern="$3"
  local nocase="${4:-0}"
  local body
  body=$(curl -skf --connect-timeout 10 "${url}" 2>&1) || {
    echo "  ✗ ${desc}  (curl gagal: ${body})"
    fail=$((fail + 1))
    return
  }
  local grep_cmd="grep -q"
  [[ "${nocase}" == "1" ]] && grep_cmd="grep -qi"
  if echo "${body}" | ${grep_cmd} "${pattern}"; then
    echo "  ✓ ${desc}"
    pass=$((pass + 1))
  else
    echo "  ✗ ${desc}  (pattern '${pattern}' tidak ditemukan)"
    fail=$((fail + 1))
  fi
}

# Helper: cek HTTP status code
expect_status() {
  local desc="$1"
  local expected="$2"
  shift 2
  local actual
  actual=$(curl -sk --connect-timeout 10 -o /dev/null -w "%{http_code}" "$@") || true
  if [[ "${actual}" == "${expected}" ]]; then
    echo "  ✓ ${desc} (HTTP ${actual})"
    pass=$((pass + 1))
  else
    echo "  ✗ ${desc}  (expected ${expected}, got ${actual:-?})"
    fail=$((fail + 1))
  fi
}

echo "=== Integration Test — ${BASE_URL} ==="
echo ""

echo "--- Infrastruktur ---"

# 1. API health
fetch_check "API health endpoint" "${BASE_URL}/api/health" '"status":"ok"'

# 2. Frontend HTML
fetch_check "Frontend index.html" "${BASE_URL}/" 'id="root"'

# 3. Swagger UI
fetch_check "Swagger /docs" "${BASE_URL}/docs" 'swagger' 1

# 4. HTTP → HTTPS redirect
HTTP_CODE=$(curl -sf --connect-timeout 5 -o /dev/null -w "%{http_code}" \
  "http://localhost:${HTTP_PORT}/" 2>/dev/null || true)
if [[ "${HTTP_CODE}" == "301" ]]; then
  echo "  ✓ HTTP redirect to HTTPS (301)"
  pass=$((pass + 1))
else
  echo "  ✗ HTTP redirect to HTTPS  (HTTP code: ${HTTP_CODE:-?})"
  fail=$((fail + 1))
fi

echo ""
echo "--- API Publik ---"

# 5. Participants API (public GET)
fetch_check "Participants list (publik)" "${BASE_URL}/api/participants" '\['

# 6. PDF export monthly (public GET)
TMP_PDF="$(mktemp /tmp/facerec-test-XXXXXX.pdf)"
PDF_OK=false
if curl -skf --connect-timeout 20 \
    "${BASE_URL}/api/export/pdf/monthly?year=2026&month=7" \
    -o "${TMP_PDF}" 2>/dev/null; then
  MAGIC=$(head -c 4 "${TMP_PDF}" 2>/dev/null || true)
  [[ "${MAGIC}" == "%PDF" ]] && PDF_OK=true
fi
${PDF_OK} && { echo "  ✓ PDF export monthly"; pass=$((pass + 1)); } \
           || { echo "  ✗ PDF export monthly  (bukan file PDF valid)"; fail=$((fail + 1)); }
rm -f "${TMP_PDF}"

echo ""
echo "--- Auth (Minggu 6) ---"

# 7. Login dengan password salah → 401
expect_status "Login password salah → 401" "401" \
  -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=salah"

# 8. Protected endpoint tanpa token → 401
expect_status "DELETE /api/attendance tanpa token → 401" "401" \
  -X DELETE "${BASE_URL}/api/attendance"

# 9. Login dengan password benar → dapat token
TOKEN=""
LOGIN_BODY=$(curl -skf --connect-timeout 10 \
  -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=${ADMIN_PASSWORD}" 2>&1) || true

if echo "${LOGIN_BODY}" | grep -q '"access_token"'; then
  echo "  ✓ Login admin berhasil (token diterima)"
  pass=$((pass + 1))
  # Ekstrak token (tanpa jq — pakai sed)
  TOKEN=$(echo "${LOGIN_BODY}" | sed 's/.*"access_token":"\([^"]*\)".*/\1/')
else
  echo "  ✗ Login admin gagal  (response: ${LOGIN_BODY})"
  fail=$((fail + 1))
fi

# 10. /api/auth/me dengan token valid
if [[ -n "${TOKEN}" ]]; then
  ME_BODY=$(curl -skf --connect-timeout 10 \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE_URL}/api/auth/me" 2>&1) || true
  if echo "${ME_BODY}" | grep -q '"authenticated"'; then
    echo "  ✓ GET /api/auth/me dengan token (authenticated)"
    pass=$((pass + 1))
  else
    echo "  ✗ GET /api/auth/me  (${ME_BODY})"
    fail=$((fail + 1))
  fi
else
  echo "  - Lewati /api/auth/me (token tidak ada)"
fi

echo ""
echo "=== Hasil: ${pass} passed, ${fail} failed ==="

if [[ ${fail} -gt 0 ]]; then
  echo ""
  echo "Tips debug:"
  echo "  podman compose -f deploy/compose.yaml logs"
  echo "  podman ps"
  exit 1
fi

echo "Semua test lulus."
