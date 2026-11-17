#!/usr/bin/env bash
# Generate self-signed TLS certificate untuk development (HTTPS + kamera browser)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/certs"

mkdir -p "${CERT_DIR}"

if [[ -f "${CERT_DIR}/cert.pem" && -f "${CERT_DIR}/key.pem" ]]; then
  echo "Sertifikat sudah ada di ${CERT_DIR}/"
  echo "Hapus manual jika ingin generate ulang."
  exit 0
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${CERT_DIR}/key.pem" \
  -out "${CERT_DIR}/cert.pem" \
  -subj "/CN=localhost/O=Facerec Dev/C=ID" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" 2>/dev/null \
  || openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${CERT_DIR}/key.pem" \
    -out "${CERT_DIR}/cert.pem" \
    -subj "/CN=localhost/O=Facerec Dev/C=ID"

chmod 600 "${CERT_DIR}/key.pem"
chmod 644 "${CERT_DIR}/cert.pem"

echo "Sertifikat dev dibuat:"
echo "  ${CERT_DIR}/cert.pem"
echo "  ${CERT_DIR}/key.pem"
echo ""
echo "Browser akan memperingatkan sertifikat self-signed — aman untuk localhost dev."
