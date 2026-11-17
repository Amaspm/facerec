# Sistem Absensi Berbasis Pengenalan Wajah

Aplikasi web untuk mencatat kehadiran secara otomatis menggunakan kamera browser dan pengenalan wajah berbasis OpenCV. Backend FastAPI + frontend React, di-deploy via Podman dengan HTTPS.

---

## Daftar Isi

1. [Gambaran Umum](#gambaran-umum)
2. [Arsitektur Sistem](#arsitektur-sistem)
3. [Prasyarat](#prasyarat)
4. [Cara Cepat — Deploy dengan Podman](#cara-cepat--deploy-dengan-podman)
5. [Development Lokal](#development-lokal)
6. [Autentikasi Admin](#autentikasi-admin)
7. [Variabel Lingkungan](#variabel-lingkungan)
8. [Migrasi Data Lama](#migrasi-data-lama)
9. [Menjalankan Test](#menjalankan-test)
10. [Struktur Proyek](#struktur-proyek)
11. [Endpoint API](#endpoint-api)
12. [Troubleshooting](#troubleshooting)

---

## Gambaran Umum

| Lapisan | Teknologi |
|---------|-----------|
| Frontend | React 19 + Vite + react-router-dom |
| Backend | FastAPI + Uvicorn |
| Computer Vision | OpenCV (Haar Cascade) + NumPy |
| Database | SQLite (`data/absensi.db`) |
| Data Wajah | Pickle (`data/faces_data.pkl`) |
| Auth | JWT Bearer (python-jose + bcrypt) |
| PDF | ReportLab |
| Deploy | Podman + Nginx (HTTPS) |

### Fitur Utama

- **Absensi real-time** — kamera browser mengenali wajah dan mencatat kehadiran otomatis
- **Registrasi wajah** — bbox overlay langsung di video saat wajah terdeteksi, ambil 3–5 sampel
- **Halaman Admin** — lihat foto wajah tiap peserta, edit nomor absen & nama, daftar ulang foto tanpa hapus riwayat
- **Laporan PDF pekanan** — tabel pivot Senin–Jumat, semua murid tampil (H/TH per hari), landscape A4
- **Laporan PDF bulanan** — detail + ringkasan kehadiran termasuk murid yang tidak hadir
- **Autentikasi JWT** — endpoint mutasi dilindungi, sesi 8 jam
- **Waktu lokal** — container memakai timezone Asia/Jakarta

---

## Arsitektur Sistem

```
Browser (HTTPS)
      │
      ▼
┌──────────────────────────────┐
│  Nginx (container)           │
│  :443 ← HTTPS (TLS)         │
│  :80  → redirect ke HTTPS   │
│  /api/* → proxy ke backend  │
│  /*    → static React files  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  facerec-api (container)     │
│  FastAPI :8000               │
│  ├── /api/auth/*             │
│  ├── /api/faces/*            │
│  ├── /api/attendance/*       │
│  ├── /api/participants/*     │
│  └── /api/export/pdf/*       │
│                              │
│  Volume: /data               │
│  ├── absensi.db              │
│  └── faces_data.pkl          │
└──────────────────────────────┘
```

---

## Prasyarat

### Untuk Deploy (Podman)
- [Podman](https://podman.io) v4+ — `podman --version`
- podman-compose **atau** `podman compose`
- `openssl` — untuk generate sertifikat TLS dev
- Port `8080` dan `8443` tersedia (atau ubah di `.env`)

### Untuk Development Lokal
- Python 3.10+ (disarankan 3.11–3.13)
- Node.js 18+ dan npm

---

## Cara Cepat — Deploy dengan Podman

### Langkah 1 — Clone dan masuk ke folder proyek

```bash
git clone <url-repo>
cd facerec
```

### Langkah 2 — Buat file konfigurasi

```bash
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env` dan **ganti password dan secret key**:

```ini
HTTP_PORT=8080
HTTPS_PORT=8443

ADMIN_PASSWORD=password_kuat_anda
SECRET_KEY=string_acak_panjang_minimal_32_karakter
JWT_EXPIRE_MINUTES=480
TZ=Asia/Jakarta
```

Generate `SECRET_KEY` dengan cepat:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Langkah 3 — Generate sertifikat TLS (development)

```bash
bash deploy/generate-certs.sh
```

> Sertifikat self-signed untuk localhost. Browser akan memperingatkan "tidak aman" — klik "Advanced → Proceed" untuk melanjutkan.

### Langkah 4 — Build dan jalankan

```bash
bash scripts/podman-up.sh
```

### Langkah 5 — Buka aplikasi

| URL | Keterangan |
|-----|------------|
| `https://localhost:8443` | Aplikasi utama |
| `https://localhost:8443/docs` | Swagger UI (API docs) |
| `https://localhost:8443/api/health` | Cek status backend |

### Langkah 6 — Verifikasi (opsional)

```bash
bash scripts/podman-integration-test.sh
# Diharapkan: 10 passed, 0 failed
```

### Menghentikan stack

```bash
podman-compose -f deploy/compose.yaml down
```

### Rebuild setelah perubahan kode

```bash
podman compose -f deploy/compose.yaml up -d --build
```

---

## Development Lokal

Mode development menjalankan backend dan frontend secara terpisah tanpa container.

### Setup sekali

```bash
# 1. Buat virtual environment Python
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 2. Install dependencies backend
pip install -r requirements-web.txt

# 3. Install dependencies frontend
cd frontend && npm install && cd ..
```

### Jalankan backend

```bash
# Terminal 1
bash scripts/run_api.sh
```

atau manual:

```bash
source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend berjalan di `http://127.0.0.1:8000` — Swagger di `/docs`.

### Jalankan frontend

```bash
# Terminal 2
bash scripts/run_frontend.sh
```

atau manual:

```bash
cd frontend && npm run dev
```

Frontend berjalan di `http://127.0.0.1:5173`.

> Vite dev server mem-proxy semua request `/api/*` ke backend `:8000` secara otomatis. Kamera browser bekerja di localhost tanpa HTTPS.

### Build frontend untuk production

```bash
cd frontend && npm run build
```

Output di `frontend/dist/` — otomatis disertakan saat build Podman image.

---

## Autentikasi Admin

Aplikasi menggunakan JWT Bearer token. Login diperlukan untuk operasi yang mengubah data.

### Endpoint yang dilindungi (butuh login)

| Operasi | Endpoint |
|---------|----------|
| Registrasi wajah | `POST /api/faces/register` |
| Hapus/buat absensi | `DELETE/POST /api/attendance` |
| Edit/hapus peserta | `PUT/PATCH/DELETE /api/participants/{nomor}` |
| Reset sampel wajah | `DELETE /api/participants/{nomor}/face-samples` |

### Endpoint publik (tanpa login)

`GET /api/health`, `GET /api/attendance`, `GET /api/participants`, `GET /api/export/pdf/*`, `POST /api/faces/recognize`, `POST /api/faces/detect`, `GET /api/participants/{nomor}/face-image`

### Login via API

```bash
curl -X POST https://localhost:8443/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=PASSWORD_ANDA" -k

# Response: {"access_token":"eyJ...","token_type":"bearer"}
```

### Login via Swagger UI

1. Buka `https://localhost:8443/docs`
2. Klik tombol **Authorize** (ikon kunci)
3. Isi `username: admin` dan `password: <password>`
4. Klik **Authorize**

---

## Variabel Lingkungan

Semua variabel dikonfigurasi di `deploy/.env` (salin dari `deploy/.env.example`).

| Variable | Default | Wajib diubah? | Keterangan |
|----------|---------|:---:|------------|
| `HTTP_PORT` | `8080` | | Port HTTP (redirect ke HTTPS) |
| `HTTPS_PORT` | `8443` | | Port HTTPS aplikasi |
| `ADMIN_PASSWORD` | `admin123` | **Ya** | Password login admin |
| `SECRET_KEY` | (random per restart) | **Ya** | Kunci signing JWT |
| `JWT_EXPIRE_MINUTES` | `480` | | Durasi sesi (menit); default 8 jam |
| `TZ` | `Asia/Jakarta` | | Timezone container |

> Jika `SECRET_KEY` tidak di-set, akan di-generate acak setiap container restart — semua sesi aktif akan logout. Selalu set eksplisit untuk production.

---

## Migrasi Data Lama

Jika sudah ada data dari versi desktop lama, salin ke volume Podman:

```bash
# Pastikan container sudah pernah jalan sekali (agar volume terbuat)
bash scripts/podman-up.sh

# Salin data lama ke volume
bash scripts/podman-migrate-data.sh

# Restart agar API load data baru
podman restart facerec-api
```

---

## Menjalankan Test

### Unit test

```bash
bash scripts/run_tests.sh
```

Atau manual:

```bash
source venv/bin/activate
python3 -m pytest tests/ -v
```

**31 test** mencakup:
- Auth API (login, token, proteksi endpoint) — 15 test
- Export PDF endpoint — 4 test
- Utilitas tanggal, query database, PDF service — 12 test

### Integration test (butuh stack Podman berjalan)

```bash
bash scripts/podman-integration-test.sh
```

10 check: health, frontend, Swagger, HTTP redirect, participants API, PDF export, auth login, protected endpoint, token valid.

---

## Struktur Proyek

```
facerec/
├── app/                               # Backend FastAPI
│   ├── main.py                        # Entry point, CORS, lifespan, startup warning
│   ├── config.py                      # Env vars: DATA_DIR, auth, timezone
│   ├── api/
│   │   ├── deps.py                    # Singleton DB & FaceSystem
│   │   ├── routes_auth.py             # POST /login, GET /me
│   │   ├── routes_faces.py            # Register, recognize, detect (bbox preview)
│   │   ├── routes_attendance.py       # Absensi CRUD + peserta CRUD + face-image
│   │   └── routes_export.py           # PDF weekly/monthly
│   ├── services/
│   │   ├── database.py                # SQLite CRUD + query laporan + update nomor
│   │   ├── face_recognition_system.py # Haar Cascade + Euclidean distance
│   │   └── pdf_service.py             # ReportLab: pivot pekanan + bulanan all-students
│   ├── models/
│   │   └── schemas.py                 # Pydantic v2 schemas
│   └── utils/
│       ├── image.py                   # Decode upload → ndarray + auto-resize
│       └── date_range.py              # ISO week range, month range, label formatter
│
├── frontend/                          # React + Vite
│   └── src/
│       ├── App.jsx                    # Router + AuthProvider
│       ├── api/client.js              # Fetch wrapper + auth headers
│       ├── context/AuthContext.jsx    # JWT token state (localStorage)
│       ├── components/
│       │   ├── Layout.jsx             # Header + nav + logout
│       │   ├── CameraCapture.jsx      # WebRTC getUserMedia + capture frame
│       │   ├── FaceDetectOverlay.jsx  # Bbox overlay canvas (loop 700ms)
│       │   ├── ProtectedRoute.jsx     # Guard: redirect ke LoginPage
│       │   ├── AlertMessage.jsx
│       │   ├── ConfirmDialog.jsx
│       │   └── LoadingSpinner.jsx
│       └── pages/
│           ├── AttendancePage.jsx     # Absensi real-time + bbox overlay
│           ├── RegisterPage.jsx       # Registrasi + bbox preview wajah
│           ├── HistoryPage.jsx        # Riwayat + filter tanggal + hapus
│           ├── AdminPage.jsx          # Grid kartu peserta: foto, edit, daftar ulang
│           ├── ReportsPage.jsx        # Export PDF pekanan & bulanan
│           └── LoginPage.jsx          # Halaman login admin
│
├── deploy/                            # Konfigurasi container
│   ├── Containerfile.api              # Image Python/FastAPI + tzdata
│   ├── Containerfile.nginx            # Multi-stage: build React + Nginx HTTPS
│   ├── compose.yaml                   # podman-compose: 2 service, 1 volume, 1 network
│   ├── nginx.conf.template            # HTTPS, proxy /api/*, SPA fallback
│   ├── nginx-entrypoint.sh            # Inject DNS resolver saat startup
│   ├── generate-certs.sh              # Buat self-signed TLS cert
│   ├── certs/                         # cert.pem + key.pem (git-ignored)
│   └── .env.example                   # Template konfigurasi
│
├── scripts/
│   ├── podman-up.sh                   # Build & jalankan stack
│   ├── podman-integration-test.sh     # Integration test 10 check
│   ├── podman-migrate-data.sh         # Salin data lama ke volume
│   ├── run_api.sh                     # Jalankan backend (dev)
│   ├── run_frontend.sh                # Jalankan frontend dev server
│   └── run_tests.sh                   # Install dev deps + jalankan pytest
│
├── tests/
│   ├── test_auth_api.py               # JWT auth 15 cases
│   ├── test_export_api.py             # PDF endpoints 4 cases
│   └── test_week2_export.py           # Utilitas & DB & PDF service 12 cases
│
├── data/                              # Data persisten (git-ignored kecuali .gitkeep)
│   └── .gitkeep
│
├── requirements-web.txt               # Dependencies backend production
├── requirements-dev.txt               # + pytest untuk testing
└── README.md                          # Dokumentasi ini
```

---

## Endpoint API

### Auth

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|:----:|-----------|
| POST | `/api/auth/login` | — | Login, dapat JWT token |
| GET | `/api/auth/me` | ✓ | Cek token valid |

### Wajah

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|:----:|-----------|
| POST | `/api/faces/register` | ✓ | Registrasi wajah (multipart) |
| POST | `/api/faces/register/base64` | ✓ | Registrasi via JSON base64 |
| POST | `/api/faces/recognize` | — | Recognize + auto-record absensi |
| POST | `/api/faces/recognize/base64` | — | Recognize via JSON base64 |
| POST | `/api/faces/detect` | — | Deteksi bbox tanpa catat absensi (preview) |
| POST | `/api/faces/detect/base64` | — | Detect via JSON base64 |

### Absensi

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|:----:|-----------|
| GET | `/api/attendance` | — | List (`limit`, `offset`, `start_date`, `end_date`) |
| POST | `/api/attendance` | ✓ | Catat absensi manual |
| DELETE | `/api/attendance/{id}` | ✓ | Hapus satu record |
| DELETE | `/api/attendance` | ✓ | Hapus semua log |

### Peserta

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|:----:|-----------|
| GET | `/api/participants` | — | Daftar peserta + jumlah sampel wajah |
| PUT | `/api/participants/{nomor}` | ✓ | Edit nama |
| PATCH | `/api/participants/{nomor}` | ✓ | Edit nomor absen dan/atau nama |
| DELETE | `/api/participants/{nomor}` | ✓ | Hapus peserta + data wajah |
| GET | `/api/participants/{nomor}/face-image` | — | Foto wajah pertama sebagai JPEG |
| DELETE | `/api/participants/{nomor}/face-samples` | ✓ | Hapus sampel wajah (untuk daftar ulang) |

### Export & Sistem

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|:----:|-----------|
| GET | `/api/export/pdf/weekly` | — | PDF pekanan pivot (`year`, `week`) |
| GET | `/api/export/pdf/monthly` | — | PDF bulanan all-students (`year`, `month`) |
| GET | `/api/health` | — | Status backend + jumlah data |

✓ = butuh `Authorization: Bearer <token>`

---

## Troubleshooting

**Browser memblokir kamera**
Kamera hanya bisa diakses di HTTPS atau `localhost`. Buka via `https://localhost:8443`.

**Sertifikat "tidak dipercaya" di browser**
Normal untuk self-signed. Di Chrome: "Advanced → Proceed to localhost". Di Firefox: "Accept the Risk".

**Container tidak mau start / error saat build**
```bash
podman compose -f deploy/compose.yaml logs
podman logs facerec-api
podman logs facerec-nginx
```

**Waktu absensi tidak sesuai**
Pastikan `TZ=Asia/Jakarta` di `deploy/.env`. Rebuild container setelah mengubah env.

**Login gagal padahal password benar**
Pastikan `ADMIN_PASSWORD` di `deploy/.env` sesuai. Restart container setelah mengubah env:
```bash
podman compose -f deploy/compose.yaml down && bash scripts/podman-up.sh
```

**Wajah tidak terdeteksi saat registrasi**
- Pastikan pencahayaan cukup, hindari backlight
- Kotak hijau/kuning harus muncul di kamera sebelum klik "Daftar Wajah"
- Jarak ideal 50–80 cm, wajah menghadap langsung ke kamera
- Daftarkan 3–5 sampel dari sudut sedikit berbeda

**Wajah tidak dikenali saat absensi**
- Threshold Euclidean distance: `3000` dan confidence gap `15%` — dapat disesuaikan di `app/services/face_recognition_system.py` (`THRESHOLD` dan `CONFIDENCE_GAP`)
- Tambah lebih banyak sampel via halaman Admin → "Daftar Ulang Foto" (minimal 5 sampel dari sudut berbeda)
- **Penting:** setelah mengubah parameter akurasi, sampel lama harus didaftar ulang karena histogram equalization diterapkan sejak versi terbaru

**Data hilang setelah container restart**
Data tersimpan di named volume `deploy_facerec-data`. Jangan hapus volume:
```bash
podman volume inspect deploy_facerec-data
```

**Port sudah dipakai**
Ubah `HTTP_PORT` dan `HTTPS_PORT` di `deploy/.env`.
