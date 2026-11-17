# Dokumentasi Analisis Migrasi Web, Podman, dan Fitur Ekspor PDF

Dokumen ini menganalisis proyek **Sistem Absensi Berbasis Pengenalan Wajah** untuk migrasi dari aplikasi desktop (Tkinter + venv) ke aplikasi berbasis web yang di-deploy menggunakan **Podman**, dengan tambahan fitur **ekspor laporan PDF per pekan dan per bulan**.

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Analisis Kondisi Proyek Saat Ini](#2-analisis-kondisi-proyek-saat-ini)
3. [Apakah venv Bisa Diintegrasikan ke Web?](#3-apakah-venv-bisa-diintegrasikan-ke-web)
4. [Kelayakan Migrasi ke Web](#4-kelayakan-migrasi-ke-web)
5. [Rekomendasi Stack Teknologi](#5-rekomendasi-stack-teknologi)
6. [Arsitektur Target (Web + Podman)](#6-arsitektur-target-web--podman)
7. [Fitur Ekspor PDF (Pekan & Bulan)](#7-fitur-ekspor-pdf-pekan--bulan)
8. [Analisis Tingkat Kesulitan](#8-analisis-tingkat-kesulitan)
9. [Timeline Implementasi](#9-timeline-implementasi)
10. [Rencana Migrasi Bertahap](#10-rencana-migrasi-bertahap)
11. [Container Podman — Rancangan Deployment](#11-container-podman--rancangan-deployment)
12. [Risiko dan Mitigasi](#12-risiko-dan-mitigasi)
13. [Estimasi Biaya & Sumber Daya](#13-estimasi-biaya--sumber-daya)
14. [Kesimpulan dan Rekomendasi](#14-kesimpulan-dan-rekomendasi)

---

## 1. Ringkasan Eksekutif

| Pertanyaan | Jawaban Singkat |
|------------|-----------------|
| **Bisa dijalankan di web?** | **Ya**, dengan refactor arsitektur (GUI Tkinter diganti frontend web, kamera via browser) |
| **venv bisa dipakai di web?** | **Tidak langsung** — venv hanya isolasi lokal; di production diganti **container Podman** yang berperan serupa |
| **Core logic bisa dipakai ulang?** | **Ya (~65–75%)** — `face_recognition_system.py` dan sebagian besar `database.py` dapat dipertahankan |
| **Podman cocok?** | **Ya** — Podman kompatibel dengan OCI/Dockerfile, cocok untuk deploy Python + OpenCV |
| **PDF per pekan/bulan?** | **Relatif mudah** — tambah query database + generator PDF di backend |
| **Tingkat kesulitan keseluruhan** | **Sedang–Tinggi (6.5/10)** |
| **Estimasi waktu (1 developer)** | **4–6 minggu** |

---

## 2. Analisis Kondisi Proyek Saat Ini

### 2.1 Profil Teknis

```
┌─────────────────────────────────────────────────────────────┐
│                    ARSITEKTUR SAAT INI                       │
├─────────────────────────────────────────────────────────────┤
│  Layer UI        │ Tkinter (desktop-only, blocking loop)    │
│  Layer Logic     │ FaceRecognitionSystem (OpenCV + NumPy)   │
│  Layer Data      │ SQLite (absensi.db) + Pickle (faces.pkl) │
│  Runtime         │ Python 3 + venv lokal                      │
│  Kamera          │ cv2.VideoCapture (akses hardware lokal)  │
│  Deployment      │ Single-process desktop app                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Inventaris Kode

| File | Baris | Peran | Reuse ke Web |
|------|-------|-------|--------------|
| `main.py` | ~322 | GUI, loop kamera, orkestrasi | **Tidak** — diganti frontend + API |
| `face_recognition_system.py` | ~100 | Deteksi & pengenalan wajah | **Ya (~95%)** — perlu adaptasi input frame |
| `database.py` | ~76 | CRUD SQLite | **Ya (~80%)** — perlu query laporan baru |
| `requirements.txt` | 3 deps | opencv, numpy, pillow | Perlu ditambah FastAPI, uvicorn, reportlab/weasyprint |

### 2.3 Fitur yang Ada vs Target Web

| Fitur | Desktop (Sekarang) | Web (Target) |
|-------|-------------------|--------------|
| Registrasi wajah | ✅ Kamera lokal | ✅ Kamera browser (WebRTC) |
| Absensi real-time | ✅ Loop 10ms | ✅ WebSocket / polling frame |
| Riwayat absensi | ✅ Treeview (50 record) | ✅ Tabel dengan pagination & filter |
| Kelola wajah terdaftar | ✅ Dialog Tkinter | ✅ Halaman admin |
| Ekspor PDF | ❌ Belum ada | ✅ Per pekan & per bulan |
| Multi-user / multi-device | ❌ Satu mesin | ✅ Akses via browser |
| Autentikasi admin | ❌ Tidak ada | ⚠️ Disarankan ditambahkan |

### 2.4 Ketergantungan yang Menghalangi Web Langsung

1. **Tkinter** — tidak berjalan di browser; seluruh UI harus dibangun ulang.
2. **`cv2.VideoCapture(index)`** — mengakses webcam OS; di web, kamera diakses via **MediaDevices API** di browser, frame dikirim ke server sebagai base64/JPEG blob.
3. **File path relatif** (`absensi.db`, `faces_data.pkl`) — di container harus dipetakan ke **volume persisten**.
4. **Loop `root.after(10ms)`** — pola event-driven desktop; di web menggunakan **WebSocket** atau **HTTP POST** per frame.

---

## 3. Apakah venv Bisa Diintegrasikan ke Web?

### 3.1 Apa Itu venv dalam Konteks Proyek Ini?

Virtual environment (`venv`) adalah mekanisme Python untuk:
- Mengisolasi dependency (`opencv-python`, `numpy`, `pillow`)
- Menghindari konflik versi paket antar proyek
- Memudahkan development lokal

**venv bukan bagian dari arsitektur aplikasi** — hanya tooling development/deployment lokal.

### 3.2 Hubungan venv ↔ Web ↔ Podman

```
Development Lokal          Production (Podman)
─────────────────          ───────────────────
python -m venv venv   →    Container image (Python + pip install)
source venv/bin/activate   podman run facerec-app
pip install -r req.txt     (dependency baked into image)

Fungsi yang SAMA: isolasi dependency
Fungsi yang BERBEDA: venv = folder lokal, container = OS mini terisolasi
```

### 3.3 Kesimpulan Integrasi venv

| Aspek | Penjelasan |
|-------|------------|
| **Kode Python di venv** | ✅ **Bisa** dipakai — venv tidak mengubah kode, hanya environment |
| **venv sebagai deployment web** | ❌ **Tidak disarankan** — production web memakai container (Podman) atau WSGI/ASGI server |
| **Workflow yang benar** | Develop dengan venv → Build image Podman → Deploy container |
| **requirements.txt** | ✅ Tetap dipakai — sebagai sumber daftar dependency di Containerfile |

**Analogi:** venv = "kotak alat di meja kerja"; Podman container = "gudang siap kirim". Isi alatnya (kode Python + library) sama, wadahnya berbeda.

---

## 4. Kelayakan Migrasi ke Web

### 4.1 Komponen yang Bisa Dipertahankan

**`face_recognition_system.py`** — Hampir tidak perlu diubah:

```python
# Input tetap: frame BGR (numpy array) dari OpenCV
# Baik dari cv2.VideoCapture MAUPUN dari decode base64 upload browser
success, message = face_system.register_face(frame, nama, nomor)
names, locations = face_system.recognize_face(frame)
```

**`database.py`** — Perlu extension, bukan rewrite:
- Tambah method `get_absensi_by_date_range(start, end)`
- Tambah method `get_absensi_per_pekan(tahun, minggu_ke)`
- Tambah method `get_absensi_per_bulan(tahun, bulan)`
- Pertimbangkan connection pooling untuk multi-request

### 4.2 Komponen yang Harus Dibangun Ulang

| Komponen Desktop | Pengganti Web |
|------------------|---------------|
| `AbsensiApp.setup_ui()` | React/Vue/HTML + CSS halaman web |
| `update_frame()` loop | JavaScript `requestAnimationFrame` + fetch/WebSocket |
| `cv2.VideoCapture` | `navigator.mediaDevices.getUserMedia()` |
| `messagebox`, `Treeview` | Komponen UI web (modal, data table) |
| `ImageTk.PhotoImage` | `<canvas>` atau `<img src="blob:...">` |

### 4.3 Alur Kamera di Web (Konsep)

```
Browser                          Backend (FastAPI)
───────                          ─────────────────
getUserMedia()
    │
    ▼
<video> element
    │
    ▼
Canvas capture frame (JPEG)
    │
    ▼
POST /api/recognize ──────────►  Decode JPEG → numpy array
    │                                 │
    │                                 ▼
    │                            recognize_face()
    │                                 │
    ◄──────────────────────────  JSON: names, boxes, status
    │
    ▼
Gambar bounding box di canvas
```

> **Catatan HTTPS:** Browser modern memblokir akses kamera di HTTP non-localhost. Production **wajib HTTPS** (Let's Encrypt via reverse proxy).

---

## 5. Rekomendasi Stack Teknologi

### 5.1 Stack Rekomendasi (Primer)

Cocok untuk tim kecil, reuse maksimal kode Python existing.

| Lapisan | Teknologi | Alasan |
|---------|-----------|--------|
| **Backend API** | **FastAPI** | Async, cepat, auto OpenAPI docs, native Python |
| **ASGI Server** | **Uvicorn** (+ Gunicorn jika multi-worker) | Standard untuk FastAPI production |
| **Computer Vision** | **OpenCV + NumPy** (existing) | Tidak perlu ganti algoritma |
| **Database** | **SQLite** (fase 1) → **PostgreSQL** (fase 2, opsional) | SQLite cukup untuk <1000 peserta; PostgreSQL untuk skala besar |
| **Frontend** | **React + Vite** atau **Vue 3** | Ekosistem matang, komponen kamera tersedia |
| **Realtime** | **WebSocket** (FastAPI) | Streaming hasil recognition tanpa polling berat |
| **PDF Generator** | **ReportLab** atau **WeasyPrint** | ReportLab: programmatic; WeasyPrint: HTML→PDF |
| **Container** | **Podman** + **Containerfile** | Rootless, OCI-compliant, drop-in Docker |
| **Reverse Proxy** | **Nginx** atau **Caddy** | HTTPS termination, static files |
| **Volume** | Podman named volume | Persist `absensi.db` + `faces_data.pkl` |

### 5.2 Stack Alternatif (Minimal / Prototipe Cepat)

| Lapisan | Teknologi | Trade-off |
|---------|-----------|-----------|
| Backend + Frontend | **FastAPI + Jinja2 templates + vanilla JS** | Lebih cepat build, UI kurang interaktif |
| PDF | **fpdf2** | Sederhana, layout terbatas |
| Deploy | Single Podman container | Monolith, cocok demo/MVP |

### 5.3 Stack yang Tidak Disarankan

| Opsi | Alasan |
|------|--------|
| Rewrite ke Node.js | Buang ulang logic OpenCV Python |
| Tkinter + VNC di container | UX buruk, latency tinggi, bukan "web native" |
| Deep learning rewrite (dlib/FaceNet) | Scope creep — algoritma current sudah cukup untuk MVP web |
| Electron wrapper | Tetap desktop, bukan web deployment |

### 5.4 Dependency Baru (`requirements-web.txt`)

```txt
# Existing
opencv-python-headless   # headless = tanpa GUI deps, lebih kecil di container
numpy
pillow

# Web stack
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
python-multipart          # upload frame
websockets                # realtime (opsional jika pakai WS)
reportlab>=4.0.0          # PDF generation
jinja2                    # template PDF (opsional)

# Production
gunicorn                  # multi-worker (opsional)
```

> Gunakan `opencv-python-headless` di container — ukuran image lebih kecil, tidak perlu libGL.

---

## 6. Arsitektur Target (Web + Podman)

### 6.1 Diagram Arsitektur

```
                    ┌──────────────────────────────────────┐
                    │           Pengguna (Browser)          │
                    │  ┌─────────┐  ┌──────────────────┐   │
                    │  │ Kamera  │  │ Dashboard Admin  │   │
                    │  │ WebRTC  │  │ + Export PDF     │   │
                    │  └────┬────┘  └────────┬─────────┘   │
                    └───────┼────────────────┼─────────────┘
                            │ HTTPS          │
                    ┌───────▼────────────────▼─────────────┐
                    │     Reverse Proxy (Nginx/Caddy)     │
                    │     :443 → :8000, static files      │
                    └───────┬────────────────────────────┘
                            │
              ┌─────────────▼─────────────────────────────┐
              │         Podman Container: facerec-api      │
              │  ┌─────────────────────────────────────┐  │
              │  │ FastAPI Application                  │  │
              │  │  ├── /api/register                   │  │
              │  │  ├── /api/recognize                  │  │
              │  │  ├── /api/attendance                 │  │
              │  │  ├── /api/participants               │  │
              │  │  ├── /api/export/pdf?period=week     │  │
              │  │  └── /api/export/pdf?period=month    │  │
              │  ├─────────────────────────────────────┤  │
              │  │ face_recognition_system.py (reuse)   │  │
              │  │ database.py (extended)               │  │
              │  │ pdf_service.py (new)                 │  │
              │  └─────────────────────────────────────┘  │
              │  Volume mount: /data                       │
              │    ├── absensi.db                          │
              │    └── faces_data.pkl                      │
              └─────────────────────────────────────────────┘
```

### 6.2 Struktur Folder Proyek (Setelah Migrasi)

```
facerec/
├── app/
│   ├── main.py                 # FastAPI entry point
│   ├── api/
│   │   ├── routes_attendance.py
│   │   ├── routes_faces.py
│   │   └── routes_export.py
│   ├── services/
│   │   ├── face_recognition_system.py   # migrated
│   │   ├── database.py                  # extended
│   │   └── pdf_service.py               # new
│   └── models/
│       └── schemas.py          # Pydantic models
├── frontend/                   # React/Vue app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── AttendancePage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   └── ReportPage.jsx
│   │   └── components/
│   │       └── CameraCapture.jsx
│   └── package.json
├── deploy/
│   ├── Containerfile
│   ├── compose.yaml            # podman-compose
│   └── nginx.conf
├── data/                       # volume mount (gitignored)
├── requirements-web.txt
└── DOKUMENTASI_MIGRASI_WEB_PODMAN.md
```

### 6.3 Endpoint API (Rancangan)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| POST | `/api/faces/register` | Registrasi wajah (frame + nomor + nama) |
| POST | `/api/faces/recognize` | Recognize frame, return identitas + bbox |
| GET | `/api/attendance` | List absensi (pagination, filter tanggal) |
| DELETE | `/api/attendance/{id}` | Hapus record |
| GET | `/api/participants` | Daftar peserta terdaftar |
| PUT | `/api/participants/{id}` | Edit nama peserta |
| DELETE | `/api/participants/{id}` | Hapus peserta + wajah |
| GET | `/api/export/pdf/weekly?year=2026&week=28` | PDF laporan mingguan |
| GET | `/api/export/pdf/monthly?year=2026&month=7` | PDF laporan bulanan |

---

## 7. Fitur Ekspor PDF (Pekan & Bulan)

### 7.1 Spesifikasi Fitur

| Parameter | Laporan Pekanan | Laporan Bulanan |
|-----------|-----------------|-----------------|
| Filter | ISO week / tanggal mulai–selesai pekan | Bulan + tahun |
| Isi | Tabel: No. Absen, Nama, Tanggal, Waktu, Status | Sama + ringkasan |
| Ringkasan | Total hadir per peserta dalam pekan | Total hadir per peserta dalam bulan |
| Format | A4 portrait, header instansi | A4 portrait |
| Output | `application/pdf` download | `application/pdf` download |

### 7.2 Query Database yang Diperlukan

Tambahan di `database.py`:

```python
def get_absensi_by_range(self, start_date: str, end_date: str) -> list:
    """start_date/end_date format: 'YYYY-MM-DD'"""
    cursor = self.conn.cursor()
    cursor.execute('''
        SELECT * FROM absensi
        WHERE date(waktu) BETWEEN ? AND ?
        ORDER BY waktu ASC
    ''', (start_date, end_date))
    return cursor.fetchall()

def get_ringkasan_kehadiran(self, start_date: str, end_date: str) -> list:
    """Agregasi jumlah kehadiran per peserta dalam rentang tanggal."""
    cursor = self.conn.cursor()
    cursor.execute('''
        SELECT nomor_absen, nama, COUNT(*) as total_hadir
        FROM absensi
        WHERE date(waktu) BETWEEN ? AND ?
        GROUP BY nomor_absen, nama
        ORDER BY nomor_absen
    ''', (start_date, end_date))
    return cursor.fetchall()
```

### 7.3 Contoh Layout PDF

```
┌────────────────────────────────────────────────────────┐
│  LAPORAN ABSENSI PEKANAN                               │
│  Periode: 07 Jul 2026 – 13 Jul 2026 (Pekan ke-28)     │
│  Dicetak: 12 Jul 2026 14:30                            │
├──────────┬─────────────────┬────────────┬──────────────┤
│ No.Absen │ Nama            │ Tanggal    │ Waktu │Status│
├──────────┼─────────────────┼────────────┼───────┼──────┤
│ 01       │ Ahmad           │ 2026-07-07 │ 07:15 │ Hadir│
│ ...      │ ...             │ ...        │ ...   │ ...  │
├──────────┴─────────────────┴────────────┴───────┴──────┤
│  RINGKASAN PEKANAN                                     │
│  Ahmad: 5 hari | Budi: 4 hari | ...                    │
└────────────────────────────────────────────────────────┘
```

### 7.4 Implementasi PDF (ReportLab — Contoh Skeleton)

```python
# app/services/pdf_service.py
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, Paragraph
from io import BytesIO

def generate_weekly_pdf(records, summary, week_label: str) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    elements = [
        Paragraph(f"Laporan Absensi Pekanan — {week_label}"),
        # ... build table from records ...
        Paragraph("Ringkasan Kehadiran"),
        # ... build summary table ...
    ]
    doc.build(elements)
    return buffer.getvalue()
```

### 7.5 Estimasi Kesulitan Fitur PDF

| Aspek | Skor | Catatan |
|-------|------|---------|
| Query data | ⭐ Mudah | 1–2 hari |
| Generate PDF basic | ⭐⭐ Sedang | 2–3 hari |
| UI pemilihan periode | ⭐ Mudah | 1 hari |
| Styling profesional | ⭐⭐ Sedang | 1–2 hari |
| **Total fitur PDF** | | **~1 minggu** |

---

## 8. Analisis Tingkat Kesulitan

### 8.1 Breakdown per Area

| Area Migrasi | Kesulitan (1–10) | Effort | Catatan |
|--------------|------------------|--------|---------|
| Extract & refactor backend API | 4/10 | Rendah | Logic sudah modular |
| Frontend web + UI/UX | 7/10 | Tinggi | Build from scratch |
| Integrasi kamera browser | 6/10 | Sedang | WebRTC + HTTPS |
| WebSocket / realtime | 5/10 | Sedang | FastAPI native support |
| Container Podman | 3/10 | Rendah | Standard Python container |
| Volume & persistence | 3/10 | Rendah | Podman volumes |
| Fitur PDF | 4/10 | Rendah–Sedang | Library mature |
| Autentikasi & keamanan | 6/10 | Sedang | Belum ada di app current |
| Testing & QA | 5/10 | Sedang | Manual + automated |
| **Rata-rata** | **6.5/10** | **Sedang–Tinggi** | |

### 8.2 Faktor yang Mempermudah

- Kode backend kecil (~500 baris) dan terpisah dengan baik
- Algoritma face recognition tidak perlu diubah
- SQLite sudah cukup untuk skala kecil–menengah
- Dependency minimal (3 paket utama)
- Dokumentasi proyek sudah lengkap

### 8.3 Faktor yang Menyulitkan

- **Seluruh GUI** harus dibangun ulang (bukan porting)
- Akses kamera di browser butuh HTTPS dan permission handling
- OpenCV di container: image size ~500MB–1GB
- Belum ada autentikasi — risiko keamanan data biometrik wajah
- `faces_data.pkl` (pickle) — pertimbangkan migrasi ke format lebih aman jangka panjang
- Performa: decode JPEG + recognize per frame bisa beban CPU server

### 8.4 Matriks Kesulitan Visual

```
Mudah ████████░░░░░░░░░░░░ Sedang ████████████░░░░░░░░ Tinggi
      │                    │                    │
      Podman              API Refactor          Frontend Web
      PDF Export          Kamera WebRTC         Auth/Security
      Volume Mount        Database Extend
```

---

## 9. Timeline Implementasi

### 9.1 Asumsi

- **1 developer** full-time, familiar Python
- Familiaritas web frontend: sedang (perlu belajar jika belum)
- Tidak termasuk redesign algoritma face recognition
- Target: MVP production-ready (bukan enterprise scale)

### 9.2 Timeline Detail (6 Minggu)

```
Minggu 1 — Persiapan & Backend API
├── Hari 1-2: Refactor struktur folder, setup FastAPI
├── Hari 3-4: Port face_recognition_system.py + database.py
├── Hari 5:   Endpoint register, recognize, attendance CRUD
└── Deliverable: API jalan via Swagger (/docs), testable dengan curl

Minggu 2 — Backend Lanjutan & PDF
├── Hari 1-2: Query laporan per pekan/bulan
├── Hari 3-4: Implementasi pdf_service.py (ReportLab)
├── Hari 5:   Endpoint export PDF + unit test query
└── Deliverable: Download PDF via API

Minggu 3 — Frontend Core
├── Hari 1:   Setup React/Vite, routing, layout
├── Hari 2-3: Komponen CameraCapture (WebRTC)
├── Hari 4-5: Halaman absensi + registrasi
└── Deliverable: Absensi end-to-end via browser (localhost)

Minggu 4 — Frontend Admin & Reports
├── Hari 1-2: Halaman riwayat absensi + kelola peserta
├── Hari 3:   Halaman export PDF (date picker pekan/bulan)
├── Hari 4-5: Polish UI, error handling, loading states
└── Deliverable: Frontend feature-complete

Minggu 5 — Container & Deploy
├── Hari 1-2: Containerfile + podman-compose.yaml
├── Hari 3:   Nginx/Caddy reverse proxy + HTTPS (self-signed dev)
├── Hari 4:   Volume persistence, environment config
├── Hari 5:   Integration test di Podman
└── Deliverable: `podman-compose up` → app accessible

Minggu 6 — Testing, Security & Dokumentasi
├── Hari 1-2: End-to-end testing, bug fixes
├── Hari 3:   Autentikasi admin basic (JWT/session)
├── Hari 4:   Performance tuning (frame rate, image quality)
├── Hari 5:   Dokumentasi deploy + handover
└── Deliverable: Production-ready MVP
```

### 9.3 Timeline Ringkas (Gantt)

| Fase | M1 | M2 | M3 | M4 | M5 | M6 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|
| Backend API | ████████ | ██ | | | | |
| PDF Export | | ████ | | | | |
| Frontend Web | | | ████████ | ████████ | | |
| Podman Deploy | | | | | ████████ | ██ |
| Testing & Security | | | | | ██ | ████████ |

### 9.4 Timeline Alternatif

| Skenario | Durasi | Kondisi |
|----------|--------|---------|
| **MVP Cepat** (FastAPI + Jinja, no React) | 2–3 minggu | UI basic, fungsional |
| **Standard** (rekomendasi) | 4–6 minggu | React frontend, PDF, Podman |
| **Production Enterprise** | 8–12 minggu | + PostgreSQL, auth RBAC, monitoring, CI/CD |

---

## 10. Rencana Migrasi Bertahap

### Fase 0 — Persiapan (Pre-migration)

- [ ] Backup `absensi.db` dan `faces_data.pkl`
- [ ] Buat branch git `feature/web-migration`
- [ ] Setup `requirements-web.txt`
- [ ] Tentukan stack frontend final

### Fase 1 — API Layer (Tanpa Sentuh GUI Desktop)

- [ ] Buat `app/main.py` FastAPI
- [ ] Copy & adapt `face_recognition_system.py`
- [ ] Extend `database.py` dengan query laporan
- [ ] Test API dengan Postman/curl + upload gambar statis

### Fase 2 — Frontend Web

- [ ] Build halaman absensi dengan kamera
- [ ] Build halaman registrasi
- [ ] Build dashboard admin
- [ ] Integrasi dengan API

### Fase 3 — PDF & Reporting

- [ ] Implement `pdf_service.py`
- [ ] UI pemilihan pekan/bulan
- [ ] Test dengan data sample multi-minggu

### Fase 4 — Containerization

- [ ] Tulis Containerfile
- [ ] Setup podman-compose dengan volume
- [ ] Configure reverse proxy + HTTPS

### Fase 5 — Deprecate Desktop (Opsional)

- [ ] Archive `main.py` (Tkinter) ke folder `legacy/`
- [ ] Update README dengan instruksi web deploy

---

## 11. Container Podman — Rancangan Deployment

### 11.1 Containerfile (Draft)

```dockerfile
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-web.txt .
RUN pip install --no-cache-dir -r requirements-web.txt

COPY app/ ./app/
COPY frontend/dist/ ./static/

ENV DATA_DIR=/data
VOLUME /data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 11.2 podman-compose.yaml (Draft)

```yaml
version: "3"
services:
  facerec-api:
    build: .
    container_name: facerec-app
    ports:
      - "8000:8000"
    volumes:
      - facerec-data:/data
    environment:
      - DATA_DIR=/data
      - FACES_FILE=/data/faces_data.pkl
      - DB_FILE=/data/absensi.db
    restart: unless-stopped

  nginx:
    image: docker.io/library/nginx:alpine
    container_name: facerec-nginx
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./deploy/certs:/etc/nginx/certs:ro
    depends_on:
      - facerec-api
    restart: unless-stopped

volumes:
  facerec-data:
```

### 11.3 Perintah Deploy

```bash
# Build image
podman build -t facerec-web:latest -f deploy/Containerfile .

# Atau dengan compose
podman-compose -f deploy/compose.yaml up -d --build

# Cek logs
podman logs -f facerec-app

# Backup data
podman volume inspect facerec-data
```

### 11.4 Pertimbangan Podman vs Docker

| Aspek | Podman | Docker |
|-------|--------|--------|
| Rootless | ✅ Native | ⚠️ Perlu config |
| Compose | podman-compose / podman compose | docker compose |
| Containerfile | ✅ Compatible | ✅ Same format |
| systemd integration | ✅ `podman generate systemd` | Manual |
| **Rekomendasi proyek ini** | ✅ **Podman** (sesuai permintaan) | Alternatif valid |

---

## 12. Risiko dan Mitigasi

| # | Risiko | Probabilitas | Dampak | Mitigasi |
|---|--------|--------------|--------|----------|
| 1 | Kamera tidak jalan tanpa HTTPS | Tinggi | Tinggi | Reverse proxy + Let's Encrypt |
| 2 | Latency recognition tinggi | Sedang | Sedang | Kurangi resolusi frame, throttle 2–5 FPS |
| 3 | Data hilang saat container dihapus | Sedang | Tinggi | Named volume Podman + backup rutin |
| 4 | Pickle file corrupt/tidak portable | Rendah | Sedang | Validasi saat load; migrasi ke JSON/numpy `.npz` |
| 5 | False positive/negative recognition | Sedang | Sedang | Pertahankan threshold 4500; tambah konfirmasi manual (opsional) |
| 6 | Akses tidak authorized ke data wajah | Tinggi | Tinggi | JWT auth, HTTPS, rate limiting |
| 7 | Image container terlalu besar | Sedang | Rendah | `opencv-python-headless`, multi-stage build |

---

## 13. Estimasi Biaya & Sumber Daya

### 13.1 Hardware Minimum (Self-hosted)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 core | 4 core |
| RAM | 2 GB | 4 GB |
| Storage | 5 GB | 20 GB (termasuk backup) |
| OS | Linux (Fedora/Ubuntu dengan Podman) | Same |

### 13.2 Spesifikasi Server VPS (Cloud)

| Provider | Spec | Estimasi/bulan |
|----------|------|----------------|
| DigitalOcean | 2 vCPU, 4GB RAM | ~$24 |
| AWS EC2 t3.medium | 2 vCPU, 4GB | ~$30 |
| VPS lokal Indonesia | 2 vCPU, 4GB | Rp 100–200rb |

### 13.3 Sumber Daya Manusia

| Role | Keahlian | Allocated Time |
|------|----------|----------------|
| Backend Developer | Python, FastAPI, OpenCV | 3 minggu |
| Frontend Developer | React, WebRTC | 2 minggu |
| DevOps (part-time) | Podman, Nginx, HTTPS | 1 minggu |

> Jika 1 orang mengerjakan semua: **4–6 minggu full-time**.

---

## 14. Kesimpulan dan Rekomendasi

### 14.1 Kesimpulan

1. **Migrasi ke web layak dilakukan** — core logic Python (OpenCV + SQLite) dapat dipertahankan.
2. **venv tidak diintegrasikan langsung ke web** — digantikan oleh **container Podman** yang memiliki fungsi isolasi serupa namun lebih cocok untuk deployment production.
3. **Tingkat kesulitan: Sedang–Tinggi (6.5/10)** — tantangan utama ada di frontend web dan integrasi kamera browser, bukan di algoritma face recognition.
4. **Fitur PDF per pekan/bulan** relatif mudah ditambahkan setelah API layer siap (~1 minggu).
5. **Podman** adalah pilihan deployment yang tepat — compatible, rootless, dan mendukung volume persisten untuk database.

### 14.2 Rekomendasi Stack Final

```
Frontend:  React + Vite + TailwindCSS
Backend:   FastAPI + Uvicorn
CV/ML:     OpenCV-headless + NumPy (existing)
Database:  SQLite + Podman volume (fase 1)
PDF:       ReportLab
Deploy:    Podman + Nginx + HTTPS
Dev:       venv lokal → build Podman image
```

### 14.3 Langkah Berikutnya (Action Items)

1. **Buat branch** `feature/web-migration`
2. **Setup FastAPI** dan port `face_recognition_system.py` + `database.py`
3. **Proof of concept kamera**: endpoint `/api/recognize` dengan upload JPEG
4. **Prototype PDF**: endpoint weekly export dengan data dummy
5. **Containerfile** minimal untuk validasi deploy Podman
6. **Baru kemudian** build frontend React penuh

### 14.4 Prioritas Fitur (MoSCoW)

| Must Have | Should Have | Could Have | Won't Have (v1) |
|-----------|-------------|------------|-----------------|
| Absensi via web | Export PDF bulanan | Dark mode UI | Mobile native app |
| Registrasi wajah | Export PDF pekanan | Email laporan otomatis | Deep learning upgrade |
| Riwayat absensi | Auth admin | Multi-kelas/rombel | Integrasi SSO |
| Podman deploy | Pagination data | Dashboard statistik | |

---

*Dokumen ini dibuat berdasarkan analisis kode sumber proyek per Juli 2026.*
*File terkait: `main.py`, `face_recognition_system.py`, `database.py`, `requirements.txt`, `README.md`*
