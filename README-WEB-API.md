# Backend Web API — Referensi

Referensi teknis backend FastAPI untuk sistem absensi wajah. Untuk panduan build dan deploy lengkap, lihat [README.md](README.md).

---

## Endpoint Lengkap

### Auth (`/api/auth`)

| Method | Path | Auth | Body / Params | Response |
|--------|------|:----:|---------------|----------|
| POST | `/api/auth/login` | — | `username`, `password` (form) | `{access_token, token_type}` |
| GET | `/api/auth/me` | ✓ | — | `{username, status}` |

### Wajah (`/api/faces`)

| Method | Path | Auth | Keterangan |
|--------|------|:----:|------------|
| POST | `/api/faces/register` | ✓ | Multipart: `image` (file), `nomor_absen`, `nama` |
| POST | `/api/faces/register/base64` | ✓ | JSON: `{image_base64, nomor_absen, nama}` |
| POST | `/api/faces/recognize` | — | Multipart: `image` (file), `auto_record` (bool) |
| POST | `/api/faces/recognize/base64` | — | JSON: `{image_base64, auto_record}` |

### Absensi (`/api/attendance`)

| Method | Path | Auth | Query Params |
|--------|------|:----:|-------------|
| GET | `/api/attendance` | — | `limit`, `offset`, `start_date`, `end_date` |
| POST | `/api/attendance` | ✓ | JSON: `{nama, status}` |
| DELETE | `/api/attendance/{id}` | ✓ | — |
| DELETE | `/api/attendance` | ✓ | — (hapus semua) |

### Peserta (`/api/participants`)

| Method | Path | Auth | Body |
|--------|------|:----:|------|
| GET | `/api/participants` | — | — |
| PUT | `/api/participants/{nomor_absen}` | ✓ | JSON: `{nama}` |
| DELETE | `/api/participants/{nomor_absen}` | ✓ | — |

### Export & Sistem

| Method | Path | Auth | Query Params |
|--------|------|:----:|-------------|
| GET | `/api/export/pdf/weekly` | — | `year`, `week` (1–53) |
| GET | `/api/export/pdf/monthly` | — | `year`, `month` (1–12) |
| GET | `/api/health` | — | — |

---

## Contoh curl

```bash
BASE="https://localhost:8443"
K="-k"  # abaikan TLS self-signed

# Health check
curl $K "${BASE}/api/health"

# Login dan simpan token
TOKEN=$(curl $K -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123" | \
  sed 's/.*"access_token":"\([^"]*\)".*/\1/')

AUTH="-H \"Authorization: Bearer ${TOKEN}\""

# Recognize wajah (public)
curl $K -X POST "${BASE}/api/faces/recognize" \
  -F "image=@foto.jpg" -F "auto_record=true"

# Registrasi wajah (butuh auth)
curl $K -X POST "${BASE}/api/faces/register" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "image=@foto.jpg" -F "nomor_absen=03" -F "nama=Budi"

# List absensi dengan filter tanggal
curl $K "${BASE}/api/attendance?limit=20&start_date=2026-07-01&end_date=2026-07-31"

# Export PDF pekanan
curl $K -o laporan-pekan.pdf \
  "${BASE}/api/export/pdf/weekly?year=2026&week=28"

# Export PDF bulanan
curl $K -o laporan-bulan.pdf \
  "${BASE}/api/export/pdf/monthly?year=2026&month=7"

# Hapus semua log (butuh auth)
curl $K -X DELETE "${BASE}/api/attendance" \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## Variabel Lingkungan Backend

| Variable | Default | Keterangan |
|----------|---------|------------|
| `DATA_DIR` | root proyek | Direktori data persisten |
| `DB_FILE` | `{DATA_DIR}/absensi.db` | Path database SQLite |
| `FACES_FILE` | `{DATA_DIR}/faces_data.pkl` | Path data wajah |
| `ADMIN_PASSWORD` | `admin123` | Password login admin — **wajib diubah** |
| `SECRET_KEY` | (random per run) | Kunci signing JWT — **wajib diset** |
| `JWT_EXPIRE_MINUTES` | `480` | Masa berlaku token (menit) |

---

## Struktur Kode Backend

```
app/
├── main.py                          # FastAPI app, CORS, lifespan, warning password default
├── config.py                        # Env vars: path data + auth config
├── api/
│   ├── deps.py                      # Singleton: Database & FaceRecognitionSystem
│   ├── routes_auth.py               # Login (bcrypt), get_current_admin dependency
│   ├── routes_faces.py              # Register (auth) + recognize (public)
│   ├── routes_attendance.py         # Absensi CRUD + peserta CRUD
│   └── routes_export.py             # PDF weekly/monthly
├── services/
│   ├── database.py                  # SQLite CRUD + query laporan
│   ├── face_recognition_system.py   # Haar Cascade + Euclidean Distance
│   └── pdf_service.py               # ReportLab: tabel detail + ringkasan
├── models/
│   └── schemas.py                   # Pydantic v2: semua request/response model
└── utils/
    ├── image.py                     # Decode multipart/base64 → ndarray + auto-resize
    └── date_range.py                # ISO week range, month range, label formatter
```

---

## Catatan Performa

Frame dari browser di-resize otomatis di backend sebelum diproses:

| Operasi | Max lebar | Alasan |
|---------|-----------|--------|
| Recognize | 320px | Deteksi real-time, cukup untuk Haar Cascade |
| Register | 480px | Butuh detail lebih untuk simpan sampel ROI |

Parameter Haar Cascade: `scaleFactor=1.1`, `minNeighbors=4`, `minSize=(60,60)`.

Threshold pengenalan (Euclidean distance): **4500** — dapat disesuaikan di `face_recognition_system.py`.

---

## Deliverable per Minggu

| Minggu | Deliverable | Status |
|--------|-------------|--------|
| 1 | FastAPI setup, port face_recognition + database, endpoint CRUD lengkap | ✅ |
| 2 | Query laporan, pdf_service (ReportLab), endpoint export PDF, unit test | ✅ |
| 3 | React + Vite, CameraCapture, halaman Absensi + Registrasi | ✅ |
| 4 | Halaman History, Participants, Reports, komponen UI lengkap | ✅ |
| 5 | Containerfile, podman-compose, Nginx HTTPS, volume, integration test | ✅ |
| 6 | JWT auth, bug fixes (HistoryPage, ReportsPage), image resize, 29 unit test + 10 integration test | ✅ |
