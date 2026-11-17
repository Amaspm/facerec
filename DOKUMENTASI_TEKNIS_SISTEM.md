# Dokumentasi Teknis — Sistem Absensi Wajah

> Dokumen ini mendeskripsikan arsitektur, dependency, algoritma inti, dan detail implementasi
> sistem absensi berbasis pengenalan wajah. Semua referensi kode diverifikasi langsung dari
> source file yang bersangkutan.

---

## 1. Technology Stack

### 1.1 Backend

| Layer | Teknologi | Sumber |
|-------|-----------|--------|
| Web Framework | FastAPI | `app/main.py` |
| ASGI Server | Uvicorn | `deploy/Containerfile.api` |
| Computer Vision | OpenCV `opencv-python-headless` | `app/services/face_recognition_system.py` |
| Numerical Computing | NumPy | `app/services/face_recognition_system.py` |
| Database | SQLite via `sqlite3` (stdlib) | `app/services/database.py` |
| Serialisasi Model | Python `pickle` (stdlib) | `app/services/face_recognition_system.py` |
| Autentikasi | JWT HS256 + bcrypt | `app/api/routes_auth.py` |
| PDF Generation | ReportLab | `app/services/pdf_service.py` |
| Validasi | Pydantic v2 | `app/models/schemas.py` |
| Image Decoding | Pillow (via OpenCV imdecode) | `app/utils/image.py` |
| Form Upload | python-multipart | `requirements-web.txt` |

### 1.2 Frontend

| Layer | Teknologi | Sumber |
|-------|-----------|--------|
| Framework | React 19 | `frontend/package.json` |
| Routing | react-router-dom v7 | `frontend/package.json` |
| Bundler / Dev Server | Vite 8 | `frontend/package.json` |
| Linter | oxlint | `frontend/package.json` |
| Camera / Media | WebRTC `getUserMedia` | `frontend/src/components/CameraCapture.jsx` |
| State Management | React Context + Hooks | `frontend/src/context/AuthContext.jsx` |

### 1.3 Infrastructure & Deployment

| Komponen | Teknologi | Sumber |
|----------|-----------|--------|
| Container Runtime | Podman (OCI-compliant) | `deploy/compose.yaml` |
| Reverse Proxy | Nginx (Alpine) | `deploy/Containerfile.nginx` |
| TLS | Self-signed (dev) / cert eksternal | `deploy/nginx.conf.template` |
| Orchestration | Podman Compose | `deploy/compose.yaml` |

---

## 2. Dependency Analysis

### 2.1 Python Dependencies (Production)

| Library | Peran |
|---------|-------|
| `opencv-python-headless` | Deteksi wajah Haar Cascade, konversi warna, resize ROI, histogram equalization, encode JPEG. Dipakai di `face_recognition_system.py` dan `utils/image.py`. |
| `numpy` | Operasi array untuk vektor wajah 10.000-D: Euclidean distance (`np.linalg.norm`), rata-rata distance (`np.mean`), reshape array untuk encode gambar. |
| `fastapi` | Web framework: deklarasi endpoint REST, middleware CORS, validasi request/response via Pydantic. |
| `uvicorn[standard]` | ASGI server untuk serving FastAPI. |
| `python-multipart` | Parsing `multipart/form-data` pada endpoint register/recognize. |
| `reportlab` | Pembuatan PDF laporan mingguan (pivot table landscape) dan bulanan (detail + ringkasan). |
| `python-jose[cryptography]` | Encode/decode JWT HS256 untuk autentikasi admin. |
| `bcrypt` | Hashing password admin saat module di-load; verifikasi saat login. |

### 2.2 Standard Library (Tidak perlu install)

| Modul | Peran |
|-------|-------|
| `sqlite3` | Database engine untuk tabel `peserta` dan `absensi`. |
| `pickle` | Serialisasi dictionary `known_faces` ke `faces_data.pkl`. |
| `datetime` | Timestamp log absensi dan expiry JWT. |
| `os` / `pathlib` | Resolusi path `DATA_DIR`, `DB_FILE`, `FACES_FILE`. |
| `secrets` | Generate `SECRET_KEY` JWT 32-byte hex secara kriptografis aman. |
| `base64` | Decode gambar base64 dari request JSON (endpoint `/base64`). |

### 2.3 Frontend Dependencies (Node.js)

| Library | Versi | Peran |
|---------|-------|-------|
| `react` | ^19.2.7 | Library UI berbasis komponen. |
| `react-dom` | ^19.2.7 | Render React ke DOM. |
| `react-router-dom` | ^7.18.1 | Client-side routing (6 route). |
| `vite` | ^8.1.1 | Bundler dan dev server. |
| `oxlint` | ^1.71.0 | Linter Rust-based untuk maintainability. |

---

## 3. Arsitektur Sistem

```
┌──────────────────────────────────────────────────────────┐
│  Browser                                                 │
│  React 19 + Vite 8 + react-router-dom 7                  │
│  AuthContext (JWT localStorage) + WebRTC getUserMedia    │
└──────────────────┬───────────────────────────────────────┘
                   │  HTTPS (port 8443 / 443)
                   ▼
┌──────────────────────────────────────────────────────────┐
│  Nginx (Alpine)  — Reverse Proxy                         │
│  HTTP→HTTPS redirect  |  /api/* → facerec-api:8000       │
│  Static files (dist/) served langsung                    │
│  client_max_body_size 15M  |  proxy_read_timeout 120s    │
└──────────────────┬───────────────────────────────────────┘
                   │  HTTP (internal bridge network)
                   ▼
┌──────────────────────────────────────────────────────────┐
│  FastAPI + Uvicorn (port 8000)                           │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ routes_auth │ │ routes_faces │ │routes_attendance │  │
│  │ /api/auth/  │ │ /api/faces/  │ │ /api/attendance/ │  │
│  └─────────────┘ └──────┬───────┘ │ /api/participants│  │
│  ┌──────────────┐        │         └──────────────────┘  │
│  │routes_export │        │        ┌──────────────────┐   │
│  │/api/export/  │        │        │   /api/health    │   │
│  │  pdf/        │        │        └──────────────────┘   │
│  └──────────────┘        │                               │
└─────────────────────┬────┼───────────────────────────────┘
                      │    │  deps.py (module-level singletons)
            ┌─────────┘    └──────────┐
            ▼                         ▼
┌───────────────────┐      ┌─────────────────────────┐
│  SQLite Database  │      │  FaceRecognitionSystem   │
│  absensi.db       │      │  known_faces (in-memory) │
│  (peserta,absensi)│      │  + faces_data.pkl        │
└───────────────────┘      └─────────────────────────┘
         ▲                           ▲
         └──── /data volume ─────────┘
              (Podman named volume)
```

### 3.1 Singleton Pattern — `app/api/deps.py`

Service inti (Database dan FaceRecognitionSystem) diinstansiasi satu kali menggunakan
module-level globals, bukan FastAPI `Depends()`. Setiap handler memanggil `get_db()` atau
`get_face_system()` secara langsung di dalam body fungsi.

```python
# app/api/deps.py
_db: Database | None = None
_face_system: FaceRecognitionSystem | None = None

def get_db() -> Database:
    global _db
    if _db is None:
        _db = Database()
    return _db

def get_face_system() -> FaceRecognitionSystem:
    global _face_system
    if _face_system is None:
        _face_system = FaceRecognitionSystem()
    return _face_system
```

**Alasan:**
- `Database`: SQLite connection harus di-share antar request agar tidak terjadi "database is locked".
- `FaceRecognitionSystem`: Memuat Haar Cascade XML dan file pickle hanya sekali saat startup.

Inisialisasi dilakukan saat lifespan startup (`app/main.py`) agar tidak terjadi cold-start pada
request pertama.

---

## 4. API Endpoints

### 4.1 Auth — `/api/auth`

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/auth/login` | — | Login admin. Body: `application/x-www-form-urlencoded` (`username`, `password`). Response: `{access_token, token_type}`. |
| GET | `/api/auth/me` | Bearer | Verifikasi token. Response: `{username, status}`. |

### 4.2 Faces — `/api/faces`

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/faces/register` | Bearer | Daftarkan wajah baru. Body: `multipart/form-data` (`image`, `nomor_absen`, `nama`). |
| POST | `/api/faces/register/base64` | Bearer | Sama, gambar dikirim sebagai base64 JSON. |
| POST | `/api/faces/detect` | — | Deteksi wajah + bbox tanpa catat absensi. Untuk live preview di halaman registrasi. |
| POST | `/api/faces/detect/base64` | — | Sama, gambar base64. |
| POST | `/api/faces/recognize` | — | Kenali wajah; jika `auto_record=true` (default), catat absensi otomatis. |
| POST | `/api/faces/recognize/base64` | — | Sama, gambar base64. |

### 4.3 Attendance — `/api/attendance`

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/attendance` | — | List absensi. Query: `limit`, `offset`, `start_date`, `end_date`. |
| POST | `/api/attendance` | Bearer | Tambah absensi manual. Body JSON: `{nomor_absen, status, waktu?}`. |
| PATCH | `/api/attendance/{id}` | Bearer | Edit record absensi (nomor_absen, waktu, status). |
| DELETE | `/api/attendance/{id}` | Bearer | Hapus satu record. |
| DELETE | `/api/attendance` | Bearer | Hapus semua record absensi. |

### 4.4 Participants — `/api/participants`

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/participants` | — | List semua peserta beserta `sample_count` wajah di pkl. |
| PUT | `/api/participants/{nomor}` | Bearer | Ganti nama peserta. Sinkronisasi ke pkl secara otomatis. |
| PATCH | `/api/participants/{nomor}` | Bearer | Ganti `nomor_absen` dan/atau `nama` sekaligus (`ParticipantFullUpdateRequest`). |
| DELETE | `/api/participants/{nomor}` | Bearer | Hapus peserta dari DB dan pkl. |
| GET | `/api/participants/{nomor}/face-image` | — | Kembalikan foto wajah pertama peserta sebagai JPEG 200×200. |
| DELETE | `/api/participants/{nomor}/face-samples` | Bearer | Reset semua sampel wajah di pkl (tapi peserta tetap di DB). |

### 4.5 Export PDF — `/api/export/pdf`

Kedua endpoint bersifat **publik** (tidak memerlukan autentikasi).

| Method | Path | Query Params | Output |
|--------|------|-------------|--------|
| GET | `/api/export/pdf/weekly` | `year`, `week` (ISO) | PDF landscape pivot Senin–Jumat. |
| GET | `/api/export/pdf/monthly` | `year`, `month` | PDF A4 detail + ringkasan bulanan. |

### 4.6 System

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/health` | Status layanan, jumlah `registered_faces` di pkl, jumlah `participants` di DB. |
| GET | `/` | Info root: path data, docs link. |

---

## 5. Skema Database

**File:** `app/services/database.py`

```sql
-- Tabel peserta: primary key nomor_absen untuk O(1) lookup
CREATE TABLE IF NOT EXISTS peserta (
    nomor_absen TEXT PRIMARY KEY,
    nama        TEXT NOT NULL
);

-- Tabel absensi: log kehadiran
CREATE TABLE IF NOT EXISTS absensi (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor_absen TEXT NOT NULL,
    nama        TEXT NOT NULL,
    waktu       TEXT NOT NULL,   -- format: "YYYY-MM-DD HH:MM:SS"
    status      TEXT NOT NULL    -- "Hadir" | "Izin" | "Sakit"
);
```

**Catatan desain:**
- Kolom `nama` sengaja disimpan di tabel `absensi` (denormalisasi) agar laporan historis
  tetap akurat meski nama peserta berubah di kemudian hari. Saat edit nama via
  `update_nama_peserta_by_nomor`, kedua tabel diupdate secara bersamaan.
- Relasi `absensi.nomor_absen → peserta.nomor_absen` bersifat implisit (tidak ada FK
  constraint) karena SQLite default. Konsistensi dijaga di application layer.
- Saat `nomor_absen` diubah via `update_nomor_absen_peserta`, kedua tabel diupdate
  dalam satu koneksi dengan duplikat-check terlebih dahulu.
- Filter tanggal menggunakan `date(waktu) >= ?` yang memanfaatkan fungsi SQLite bawaan
  untuk memotong bagian jam dari string datetime.

---

## 6. Model Data (Pydantic Schemas)

**File:** `app/models/schemas.py`

| Schema | Digunakan untuk |
|--------|----------------|
| `TokenResponse` | Response login: `{access_token, token_type}` |
| `HealthResponse` | `/api/health`: `{status, service, registered_faces, participants}` |
| `ParticipantResponse` | Item list peserta: `{nomor_absen, nama, sample_count}` |
| `ParticipantUpdateRequest` | PUT nama saja: `{nama}` |
| `ParticipantFullUpdateRequest` | PATCH nomor dan/atau nama: `{nomor_absen?, nama?}` |
| `AttendanceRecord` | Satu baris absensi: `{id, nomor_absen, nama, waktu, status}` |
| `AttendanceListResponse` | Paginated list: `{total, limit, offset, items[]}` |
| `AttendanceCreateRequest` | POST absensi manual: `{nomor_absen, status, waktu?}` |
| `AttendanceUpdateRequest` | PATCH absensi: `{nomor_absen, waktu, status}` |
| `FaceBBox` | Koordinat bounding box: `{top, right, bottom, left}` |
| `RecognizedFace` | Satu wajah terdeteksi: `{key, nomor_absen?, nama?, recognized, already_attended_today, attendance_recorded, bbox}` |
| `RecognizeResponse` | Response recognize/detect: `{faces_detected, faces[]}` |
| `RegisterResponse` | Response register: `{success, message, nomor_absen, nama, sample_count}` |
| `RecognizeBase64Request` | Body recognize base64: `{image_base64, auto_record}` |
| `RegisterBase64Request` | Body register base64: `{image_base64, nomor_absen, nama}` |
| `MessageResponse` | Response generik: `{success, message}` |

---

## 7. Matematika & Algoritma Face Recognition

### 7.1 Deteksi Wajah: Haar Cascade Classifier

**Model:** `haarcascade_frontalface_default.xml` (bundled dengan OpenCV)

**Parameter:**
```python
# app/services/face_recognition_system.py
faces = self.face_cascade.detectMultiScale(
    gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60)
)
```

- `scaleFactor=1.1`: Tiap level piramida gambar dikecilkan 10%. Makin kecil → lebih akurat, lebih lambat.
- `minNeighbors=4`: Jumlah detection rectangle yang harus overlap sebelum region diterima sebagai wajah. Menekan false positive.
- `minSize=(60,60)`: Wajah lebih kecil dari 60×60 piksel diabaikan.

Viola-Jones bekerja dengan integral image untuk menghitung fitur Haar (selisih area terang/gelap)
secara O(1) per fitur. Classifier stage-by-stage membuang region non-wajah lebih awal.

### 7.2 Preprocessing: Histogram Equalization

```python
# app/services/face_recognition_system.py
def _normalize(self, face_gray: np.ndarray) -> np.ndarray:
    return cv2.equalizeHist(face_gray)
```

**Formula:**
```
hist_eq(v) = round( (CDF(v) - CDF_min) / (M·N - CDF_min) · (L - 1) )
```

- `CDF(v)` = cumulative distribution function intensitas v
- `M×N` = ukuran citra (100×100)
- `L` = 256 (level grayscale 8-bit)

Tujuan: normalisasi kontras agar robust terhadap variasi pencahayaan antara sesi registrasi
dan pengenalan.

### 7.3 Representasi Fitur: Flattened Grayscale Vector

1. ROI di-crop dari frame menggunakan koordinat bounding box deteksi.
2. Resize ke **100×100** piksel → 10.000 elemen.
3. Histogram equalization.
4. `flatten()` → vektor 1-D `v ∈ ℝ^10000`.
5. Cast ke `float64`.

### 7.4 Metrik Kemiripan: Euclidean Distance (L2 Norm)

```
d(v_input, v_sample) = ‖v_input − v_sample‖₂
                     = √( Σ_{k=0}^{9999} (v_input[k] − v_sample[k])² )
```

```python
distances = [np.linalg.norm(face_roi - kf) for kf in known_faces_list]
```

### 7.5 Agregasi per Identity: Mean Distance

Setiap identity bisa memiliki banyak sample (dari beberapa sesi registrasi). Jaraknya
diagregasi dengan rata-rata:

```
d̄(identity) = (1/N) · Σ_{i=1}^{N} ‖v_input − v_sample_i‖₂
```

```python
avg_dist = np.mean(distances)
```

Ini mereduksi noise dari variasi ekspresi/postur antar sample.

### 7.6 Threshold dan Confidence Gap

```python
# app/services/face_recognition_system.py
THRESHOLD = 3000       # jarak maksimum agar cocok
CONFIDENCE_GAP = 0.15  # best match harus 15% lebih dekat dari runner-up
```

Keputusan identitas menerapkan **dua kondisi sekaligus**:

```
IF min_dist < THRESHOLD
   AND (second_dist = ∞  OR  min_dist ≤ second_dist × (1 − 0.15))
THEN identity = best_match
ELSE identity = "Tidak Dikenal"
```

```python
if best_match and min_dist < self.THRESHOLD:
    gap_ok = (second_dist == float("inf")) or (
        min_dist <= second_dist * (1 - self.CONFIDENCE_GAP)
    )
    if gap_ok:
        nama = best_match
```

**Interpretasi:**
- `second_dist = ∞` terjadi saat hanya 1 identity terdaftar → confidence gap selalu terpenuhi.
- Saat >1 identity: best match harus setidaknya 15% lebih dekat dari kandidat kedua.
  Ini mencegah false positive ketika dua wajah memiliki kemiripan tinggi ("hampir seri").
- Nilai 3000 dipilih lebih ketat dari sebelumnya (4500) untuk mengurangi lolosnya wajah asing.

---

## 8. Pipeline Registrasi Wajah

**File:** `app/services/face_recognition_system.py` → `register_face(frame, nama, nomor_absen)`  
**Dipanggil dari:** `app/api/routes_faces.py` → `register_face()` / `register_face_base64()`

```
Frame BGR (dari upload multipart atau base64)
    │
    ▼ app/utils/image.py — resize ke max 480px (INTER_AREA)
    ▼ cv2.cvtColor → Grayscale
    ▼ detectMultiScale(scaleFactor=1.1, minNeighbors=4, minSize=60)
    │
    ├─ 0 wajah → return False, "Wajah tidak terdeteksi"
    ├─ >1 wajah → return False, "Terdeteksi lebih dari 1 wajah"
    │
    ▼ crop ROI: gray[y:y+h, x:x+w]
    ▼ resize ke (100, 100)
    ▼ equalizeHist
    ▼ flatten().astype(float)  →  vektor ℝ^10000
    │
    ▼ known_faces[f"{nomor_absen}|{nama}"].append(vektor)
    ▼ pickle.dump ke faces_data.pkl
    │
    ▼ db.tambah_peserta(nomor_absen, nama)   — INSERT OR REPLACE
    │
    ▼ return RegisterResponse(success=True, sample_count=N)
```

Setiap panggilan `register_face` menambah **satu sample baru** untuk identity tersebut.
Memanggil endpoint beberapa kali dengan foto berbeda meningkatkan robustness pengenalan
karena mean distance menjadi lebih stabil.

---

## 9. Pipeline Pengenalan & Auto-Absensi

**File:** `app/api/routes_faces.py` → `_build_recognize_response(frame, auto_record)`

```
Frame BGR (dari upload multipart atau base64)
    │
    ▼ app/utils/image.py — resize ke max 320px (INTER_AREA)
    ▼ face_system.recognize_face(frame)
    │   ├─ Grayscale + Haar Cascade
    │   ├─ Untuk setiap wajah terdeteksi:
    │   │   ├─ crop, resize 100×100, equalizeHist, flatten
    │   │   ├─ Hitung mean Euclidean distance ke semua identity
    │   │   ├─ Threshold (3000) + Confidence Gap (15%)
    │   │   └─ Kembalikan key "nomor|nama" atau "Tidak Dikenal"
    │   └─ return (names[], locations[])
    │
    ▼ Cross-check DB: ambil set nomor_absen yang terdaftar
    │   registered_nomors = {p["nomor_absen"] for p in db.get_semua_peserta()}
    │   Jika key cocok tapi nomor tidak ada di DB → anggap "Tidak Dikenal"
    │   (mencegah wajah pkl-lama yang sudah dihapus dari DB tetap dikenali)
    │
    ▼ Untuk setiap wajah yang recognized:
    │   ├─ Cek: db.get_absensi_hari_ini(nama)  →  sudah absen hari ini?
    │   └─ Jika auto_record=True AND belum absen:
    │       └─ db.tambah_absensi(nama, "Hadir")  →  INSERT ke absensi
    │
    ▼ return RecognizeResponse(faces_detected=N, faces=[RecognizedFace, ...])
```

**Field `RecognizedFace` yang penting:**

| Field | Makna |
|-------|-------|
| `recognized` | True jika lulus threshold + confidence gap |
| `already_attended_today` | True jika sudah ada record hari ini sebelum request ini |
| `attendance_recorded` | True jika absensi baru saja dicatat pada request ini |
| `bbox` | Koordinat `{top, right, bottom, left}` dalam piksel (setelah resize) |

---

## 10. Auto-Resize untuk Performa

**File:** `app/utils/image.py` → `_resize_if_needed(frame, max_width)`

```python
_MAX_RECOGNIZE_WIDTH = 320   # loop real-time 800ms
_MAX_REGISTER_WIDTH  = 480   # registrasi (detail lebih tinggi)

def _resize_if_needed(frame, max_width):
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale  = max_width / w
    new_w  = max_width
    new_h  = int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
```

`INTER_AREA` cocok untuk downsampling karena menghitung rata-rata area piksel, menghasilkan
anti-aliasing yang baik tanpa artefak blur berlebihan.

**Dampak performa (estimasi frame 1920×1080):**

| Skenario | Dimensi setelah resize | Pixel ratio |
|----------|----------------------|-------------|
| Recognize | 320×180 | ~36× lebih sedikit piksel |
| Register | 480×270 | ~16× lebih sedikit piksel |

Pengurangan piksel ini berdampak langsung pada kecepatan Haar Cascade karena kompleksitas
deteksi berskala dengan luas gambar.

---

## 11. Algoritma PDF Report

**File:** `app/services/pdf_service.py`

### 11.1 Laporan Mingguan (Weekly Pivot)

Output: PDF **landscape A4**, margin 1.5cm.

**Struktur tabel:**
```
| No Absen | Nama | Sen 06/01 | Waktu | Sel 07/01 | Waktu | ... | Jum 10/01 | Waktu |
|----------|------|-----------|-------|-----------|-------|-----|-----------|-------|
| 01       | Ali  |     H     | 07:01 |    TH     |   -   | ... |     H     | 07:05 |
```

**Algoritma:**
1. Hitung tanggal Senin–Jumat dari ISO week menggunakan `date.fromisocalendar(year, week, 1..7)`.
2. Buat index `absen_index[(nomor_absen, "YYYY-MM-DD")] = "HH:MM"` dari semua records.
   Jika ada duplikat dalam satu hari, waktu **pertama** yang disimpan.
3. Untuk setiap peserta × setiap hari kerja: lookup ke `absen_index`.
   - Ada entry → cell `"H"` + `"HH:MM"` (5 karakter pertama dari jam)
   - Tidak ada → cell `"TH"` + `"-"`
4. Header row ditambahkan tanggal (`DD/MM`) dalam baris yang sama dengan nama hari.
5. Warna cell: H = hijau muda (`#f0fff4`, teks `#276749`), TH = merah muda (`#fff5f5`, teks `#c53030`).

**Lebar kolom:** No(1.3cm) + Nama(4.2cm) + 5×(Hari 1.5cm + Waktu 1.5cm) = **20.5cm** dari 22.7cm usable.

### 11.2 Laporan Bulanan (Monthly Detail + Summary)

Output: PDF **portrait A4**, margin 1.5cm.

**Detail table** — semua peserta tampil:
1. Query `records` (semua absensi dalam bulan) dan `peserta` (semua terdaftar).
2. Buat `index[nomor_absen] = [list records]` dengan `collections.defaultdict`.
3. Loop per peserta: jika ada record → satu baris per record; jika tidak → satu baris `TH`.
4. Baris TH mendapat background merah muda.

**Summary table** — ringkasan kehadiran:
1. Hitung `hadir_count[nomor_absen]` dari records dengan `collections.defaultdict(int)`.
2. Hitung hari kerja (Senin–Jumat) dalam rentang bulan dengan loop Python `date` + `weekday() < 5`.
3. Persentase kehadiran: `hadir / hari_kerja * 100` (dibulatkan ke integer, diformat `"XX%"`).

```
Persentase = (Hari Hadir / Total Hari Kerja) × 100%
```

Header summary berwarna hijau (`#2f855a`) untuk membedakan dari detail.

---

## 12. Autentikasi & Keamanan

**File:** `app/api/routes_auth.py`, `app/config.py`

### 12.1 Alur Login

```
POST /api/auth/login  (application/x-www-form-urlencoded)
    │
    ▼ bcrypt.checkpw(password.encode(), _ADMIN_PASSWORD_HASH)
    │   Hash dihitung sekali saat module di-load, bukan per request
    │
    ├─ Salah → HTTP 401
    │
    ▼ jwt.encode({sub: "admin", exp: now + 480min}, SECRET_KEY, "HS256")
    ▼ return {access_token, token_type: "bearer"}
```

### 12.2 Validasi Token (Protected Endpoints)

```python
# app/api/routes_auth.py — dependency get_current_admin
payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
sub = payload.get("sub")   # "admin"
```

Jika token kadaluarsa atau signature tidak valid → HTTP 401.

### 12.3 Konfigurasi Keamanan

| Variable | Default | Keterangan |
|----------|---------|------------|
| `ADMIN_PASSWORD` | `admin123` | **Wajib diganti di production.** Warning ditampilkan saat startup jika masih default. |
| `SECRET_KEY` | `secrets.token_hex(32)` (random tiap restart) | **Wajib di-set via env di production.** Jika tidak di-set, semua token aktif menjadi invalid setiap kali server restart karena key berubah. |
| `JWT_ALGORITHM` | `HS256` | Hardcoded, tidak bisa diubah via env. |
| `JWT_EXPIRE_MINUTES` | `480` (8 jam) | Dapat diubah via env. |

> **Peringatan:** `SECRET_KEY` yang tidak di-set via environment variable bersifat **ephemeral** —
> dibuat baru tiap kali proses server dimulai. Ini berarti semua pengguna yang sedang login
> akan ter-logout secara otomatis setiap server restart.

### 12.4 Endpoint Publik vs Protected

**Publik (tanpa token):**
- `GET /api/health`
- `GET /api/attendance` (baca saja)
- `GET /api/participants` (baca saja)
- `GET /api/participants/{nomor}/face-image`
- `POST /api/faces/detect` dan `/detect/base64`
- `POST /api/faces/recognize` dan `/recognize/base64`
- `GET /api/export/pdf/weekly` dan `/monthly`

**Memerlukan Bearer token:**
- Semua operasi tulis/hapus pada absensi, peserta
- Register wajah baru
- Reset/hapus face samples

---

## 13. Frontend

**Stack:** React 19 + Vite 8 + react-router-dom v7

### 13.1 Routing (App.jsx)

```
/             → AttendancePage   — live camera recognition + riwayat hari ini
/register     → RegisterPage     — daftarkan wajah baru (kamera + upload)
/history      → HistoryPage      — riwayat absensi dengan filter tanggal
/participants → ParticipantsPage — manajemen peserta (CRUD + foto wajah)
/admin        → AdminPage        — panel admin (hapus semua, dll)
/reports      → ReportsPage      — download PDF mingguan / bulanan
```

Semua route dibungkus `ProtectedRoute` yang menangani redirect ke form login modal jika
token tidak ada atau kadaluarsa. Tidak ada halaman login terpisah.

### 13.2 State Management

`AuthContext` (`frontend/src/context/AuthContext.jsx`) menyimpan:
- `token` — JWT dari `localStorage` (key: `facerec_token`)
- `username` — nama admin setelah verifikasi
- `loading` — status verifikasi token saat mount

Saat mount, token di-`localStorage` diverifikasi ke `GET /api/auth/me`. Token invalid
dihapus otomatis.

### 13.3 API Client (`frontend/src/api/client.js`)

Semua call ke backend menggunakan native `fetch`. Fungsi `authHeaders()` membaca token
dari `localStorage` dan menambahkan header `Authorization: Bearer <token>` pada
request yang memerlukan autentikasi.

Fungsi `handleResponse()` menangani error HTTP: mencoba parse JSON untuk detail error,
fallback ke `response.text()`, lalu throw `Error` agar bisa di-catch di komponen.

**Interval live recognition (AttendancePage):** 800ms per frame capture.

### 13.4 Image Upload

- **Multipart:** gambar dikirim sebagai `Blob` dengan `FormData`.
- **Base64:** gambar di-encode dari `<canvas>` (WebRTC frame) dan dikirim sebagai JSON.
  Data URL prefix (`data:image/jpeg;base64,`) distrip di `decode_base64_image()` backend.

---

## 14. Deployment

### 14.1 Topologi Container

```
Host
 ├── facerec-api  (python:3.12-slim-bookworm)
 │    ├── Uvicorn :8000  (internal only)
 │    ├── /data volume → SQLite + pickle
 │    └── HEALTHCHECK: urllib.request ke /api/health tiap 30s
 │
 └── facerec-nginx  (Nginx Alpine)
      ├── :80  → redirect HTTPS
      ├── :8443 → HTTPS (default) / :443 jika diubah via env
      ├── /api/* → proxy ke facerec-api:8000
      └── /* → serve static dist/ (React build)
```

Kedua container terhubung via **bridge network** `facerec-net`. API tidak expose port ke host.

### 14.2 Environment Variables

| Variable | Default compose | Keterangan |
|----------|----------------|------------|
| `ADMIN_PASSWORD` | `admin123` | Password login admin. |
| `SECRET_KEY` | `""` (ephemeral) | JWT secret. **Harus di-set untuk production.** |
| `JWT_EXPIRE_MINUTES` | `480` | Masa berlaku token (menit). |
| `DATA_DIR` | `/data` | Root direktori data di container. |
| `DB_FILE` | `/data/absensi.db` | Path SQLite. |
| `FACES_FILE` | `/data/faces_data.pkl` | Path pickle wajah. |
| `TZ` | `Asia/Jakarta` | Timezone untuk timestamp absensi. |
| `HTTP_PORT` | `8080` | Port HTTP di host. |
| `HTTPS_PORT` | `8443` | Port HTTPS di host. |

### 14.3 Containerfile API

**File:** `deploy/Containerfile.api`

```dockerfile
FROM python:3.12-slim-bookworm

RUN apt-get install -y libgl1 libglib2.0-0 tzdata
# libgl1 dan libglib2.0-0 diperlukan oleh opencv-python-headless di Debian

COPY requirements-web.txt .
RUN pip install --no-cache-dir -r requirements-web.txt

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 14.4 Konfigurasi Nginx

**File:** `deploy/nginx.conf.template`  
(Template — placeholder `__RESOLVER__` diisi oleh `nginx-entrypoint.sh` saat container start
dengan DNS resolver aktual Podman/Docker.)

Poin penting:
- `client_max_body_size 15M` — batas upload gambar.
- `proxy_read_timeout 120s` — tolerasi untuk proses recognition yang berat.
- `resolver __RESOLVER__ valid=10s ipv6=off` — DNS dinamis container network.
- `set $backend_api "facerec-api:8000"` — variabel digunakan agar Nginx tidak gagal
  start jika upstream belum siap (lazy resolution).
- `http2 on` diaktifkan pada port 443.
- TLS: `TLSv1.2 TLSv1.3` saja; `ssl_prefer_server_ciphers off`.

### 14.5 Persistensi Data

Data persisten disimpan di **named Podman volume** `facerec-data` yang di-mount ke `/data`
pada container API. Volume tidak terhapus saat container di-recreate.

```yaml
volumes:
  facerec-data:   # Podman/Docker managed volume
```

Isi volume:
- `absensi.db` — database SQLite
- `faces_data.pkl` — dictionary wajah ter-serialisasi

---

## 15. Alur Data End-to-End

### 15.1 Alur Absensi Otomatis (Halaman Utama)

```
1. Browser: kamera aktif via WebRTC getUserMedia
2. Setiap 800ms: canvas.toBlob() → kirim ke POST /api/faces/recognize
3. app/utils/image.py: resize frame ke max 320px
4. face_recognition_system.recognize_face(frame):
   a. BGR → Grayscale
   b. Haar Cascade detectMultiScale → bounding boxes
   c. Untuk setiap wajah:
      - Crop ROI, resize 100×100, equalizeHist, flatten → v ∈ ℝ^10000
      - Mean Euclidean distance ke semua identity di known_faces
      - Threshold 3000 + Confidence Gap 15%
      - Return key "nomor|nama" atau "Tidak Dikenal"
5. routes_faces._build_recognize_response():
   a. Cross-check key vs registered_nomors di DB
   b. Jika recognized & auto_record & belum absen hari ini:
      → db.tambah_absensi(nama, "Hadir")
6. Response JSON: faces_detected, faces[{bbox, nama, recognized, ...}]
7. Frontend: gambar bbox overlay di canvas, update riwayat hari ini
```

### 15.2 Alur Registrasi Wajah

```
1. Admin login → token JWT disimpan di localStorage
2. Buka halaman /register: kamera aktif (atau upload file)
3. Frame preview → POST /api/faces/detect (tanpa auth, tanpa catat absensi)
   → tampilkan bbox real-time agar pengguna bisa posisikan wajah
4. Klik "Daftarkan":
   POST /api/faces/register (Bearer token)
   Body: {image, nomor_absen, nama}
5. Backend: deteksi wajah → validasi 1 wajah → crop+preprocess → simpan ke pkl
6. db.tambah_peserta() — INSERT OR REPLACE
7. Response: {success, sample_count}
8. Memanggil endpoint beberapa kali menambah sample baru (meningkatkan akurasi)
```

### 15.3 Alur Edit / Rename Peserta

```
PATCH /api/participants/{nomor}  (ParticipantFullUpdateRequest)
    │
    ├─ nomor_absen berubah?
    │   ├─ db.update_nomor_absen_peserta(old, new) — cek duplikat dulu
    │   └─ face_system.rename_nomor_absen(old, new)
    │       → rename semua key "old|nama" → "new|nama" di known_faces
    │       → save pkl
    │
    └─ nama berubah?
        ├─ face_system.get_face_key_by_nomor() → edit_face_name()
        │   → rename key "nomor|old_nama" → "nomor|new_nama"
        │   → save pkl
        └─ db.update_nama_peserta_by_nomor()
            → UPDATE peserta SET nama=?
            → UPDATE absensi SET nama=?  (sinkronisasi historis)
```

---

## 16. Kompleksitas Komputasi

### 16.1 Recognition per Request

| Tahap | Kompleksitas |
|-------|-------------|
| Resize frame | O(W·H) |
| Haar Cascade (grayscale + pyramid) | O(W·H·S), S = jumlah level skala |
| Preprocessing per wajah (crop, resize, equalize, flatten) | O(100²) = O(10.000) |
| Distance computation per identity | O(N_samples · 10.000) |
| Total untuk F wajah, I identity, N̄ sample rata-rata | O(W·H·S + F · I · N̄ · 10.000) |

Dalam praktik F biasanya 1, I < 100, N̄ < 10 → dominan oleh Haar Cascade.

### 16.2 Penyimpanan Wajah

| Item | Ukuran |
|------|--------|
| Satu vektor wajah (float64) | 10.000 × 8 byte = **80 KB** |
| 10 sample per peserta | 800 KB |
| 50 peserta × 10 sample | **40 MB** pkl |

SQLite `absensi.db` sangat kecil karena hanya menyimpan string (nomor, nama, waktu, status).

---

## 17. Keterbatasan Sistem

| Aspek | Keterbatasan | Catatan |
|-------|-------------|---------|
| **Algoritma recognition** | Nearest-neighbor Euclidean pada raw pixel, bukan fitur deep learning | Sensitif terhadap perubahan pencahayaan ekstrem, posisi kepala miring, kacamata |
| **Threshold fixed** | `THRESHOLD=3000` tidak adaptif terhadap jumlah peserta | Dengan banyak peserta yang wajahnya mirip, perlu tuning manual |
| **Scalability pkl** | Seluruh `known_faces` dimuat ke RAM setelah startup | Dengan 1000+ peserta pkl bisa >1GB; perlu database vektor terpisah |
| **Satu admin** | Hanya satu akun admin hardcoded | Tidak ada multi-user atau role management |
| **SQLite** | Tidak mendukung concurrent write tinggi | Cocok untuk deployment single-instance; perlu migrasi ke PostgreSQL untuk multi-instance |
| **Anti-duplikasi harian** | Hanya cek hari ini berdasarkan `nama`, bukan `nomor_absen` | Jika dua peserta kebetulan bernama sama, bisa terjadi false-duplicate |
| **Secret Key ephemeral** | Jika `SECRET_KEY` tidak di-set, semua token invalid setiap restart | Semua sesi login hilang setelah server restart |
| **CORS allow_origins=["*"]** | Semua origin diizinkan | Perlu dibatasi di production |

---

## 18. Riwayat Perubahan Algoritma Pengenalan Wajah

Bagian ini mendokumentasikan perubahan signifikan pada algoritma pengenalan wajah,
termasuk kondisi sebelum dan sesudah perubahan beserta alasan teknis di baliknya.

---

### 18.1 Kondisi Sebelum Perubahan (Versi Awal)

**File:** `app/services/face_recognition_system.py` — versi awal setelah migrasi desktop → web

#### Kode `recognize_face` sebelum perubahan

```python
def recognize_face(self, frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)

    if len(faces) == 0:
        return None, []

    recognized_names = []
    face_locations = []

    for (x, y, w, h) in faces:
        face_roi = gray[y : y + h, x : x + w]
        face_roi = cv2.resize(face_roi, (100, 100))
        face_roi = face_roi.flatten().astype(float)   # ← langsung flatten, TANPA equalize

        nama = "Tidak Dikenal"
        min_dist = float("inf")
        best_match = None

        for key, known_faces_list in self.known_faces.items():
            distances = [np.linalg.norm(face_roi - kf) for kf in known_faces_list]
            if distances:
                avg_dist = np.mean(distances)
                if avg_dist < min_dist:
                    min_dist = avg_dist
                    best_match = key   # ← tidak ada second_dist

        if min_dist < 4500 and best_match:   # ← threshold 4500, TANPA confidence gap
            nama = best_match

        recognized_names.append(nama)
        face_locations.append((y, x + w, y + h, x))

    return recognized_names, face_locations
```

#### Kode `register_face` sebelum perubahan

```python
def register_face(self, frame, nama, nomor_absen):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)

    # ...
    x, y, w, h = faces[0]
    face_roi = gray[y : y + h, x : x + w]
    face_roi = cv2.resize(face_roi, (100, 100))
    # ← TIDAK ada equalizeHist di sini
    self.known_faces[key].append(face_roi.flatten().astype(float))
```

#### Parameter Haar Cascade sebelum perubahan

```python
detectMultiScale(gray, 1.3, 5)
# scaleFactor=1.3  minNeighbors=5  minSize=tidak dibatasi
```

---

### 18.2 Masalah yang Ditemukan pada Versi Awal

Dua gejala nyata ditemukan saat pengujian:

**Gejala 1 — Wajah tidak terdaftar tetap dikenali**
> Dua wajah yang belum terdaftar sama-sama terdeteksi sebagai peserta no. 19.

**Gejala 2 — Salah kenali antar peserta**
> Peserta no. 1 yang berdiri di depan kamera justru dicatat sebagai no. 13.

Kedua gejala ini bersumber dari tiga kelemahan algoritma:

#### Kelemahan A — Threshold 4500 Terlalu Longgar

Vektor wajah memiliki dimensi **10.000** (gambar 100×100 piksel, nilai 0–255).
Jarak Euclidean maksimum teoritis di ruang ini:

```
d_max = √10.000 × 255 = 100 × 255 = 25.500
```

Threshold 4500 berarti **17,6% dari jarak maksimum**:

```
4500 / 25500 × 100% = 17,6%
```

Dengan toleransi 17,6%, sangat banyak wajah asing yang kebetulan memiliki distribusi
piksel "cukup mirip" dengan satu-satunya sampel yang ada bisa lolos menjadi "dikenali".

Ilustrasi masalah dengan data nyata saat itu:
- `known_faces` hanya berisi **1 sampel per orang**
- Wajah asing → cari kandidat terdekat → anggaplah jaraknya 4200 → karena `4200 < 4500` → dikenali sebagai orang tersebut

#### Kelemahan B — Tidak Ada Normalisasi Pencahayaan

Sampel disimpan sebagai **raw grayscale pixel** tanpa normalisasi. Dua foto wajah yang
**sama orang** diambil dengan pencahayaan berbeda bisa menghasilkan jarak ribuan poin
hanya karena selisih kecerahan global, sementara dua orang berbeda dalam kondisi pencahayaan
serupa bisa memiliki jarak yang justru lebih kecil.

Contoh (ilustratif):
```
Sampel A (terang)      : nilai rata-rata piksel ≈ 180
Sampel A (gelap/malam) : nilai rata-rata piksel ≈ 80
Perbedaan rata-rata    : 100 per piksel × 10.000 dimensi → kontribusi jarak besar
```

Ini menyebabkan pengguna yang sama bisa tidak dikenali jika pencahayaan berubah, sekaligus
orang lain yang kondisi cahayanya kebetulan mirip dengan kondisi sampel bisa masuk threshold.

#### Kelemahan C — Tidak Ada Confidence Gap

Algoritma hanya menguji satu kondisi:
```
min_dist < 4500  → kenali
```

Tidak ada mekanisme untuk mendeteksi situasi "hampir seri" — yaitu ketika dua identity
memiliki jarak yang sangat dekat satu sama lain terhadap wajah yang masuk:

```
Contoh skenario rawan salah:
  Jarak ke no.  1  =  4100
  Jarak ke no. 13  =  4300
  Selisih         =   200  (hanya 0,8% dari jarak max)

Kondisi lama: no. 1 dipilih karena min_dist (4100) < 4500 ✓
→ Padahal selisih 200 dari 10.000-dimensi space ini sangat kecil,
  artinya hampir tidak bisa dibedakan → keputusan tidak bisa dipercaya
```

---

### 18.3 Perubahan yang Diterapkan

Tiga perbaikan diterapkan sekaligus di `recognize_face` dan `register_face`:

#### Perubahan 1 — Threshold Diturunkan: `4500 → 3000`

```python
# Sebelum
if min_dist < 4500 and best_match:
    nama = best_match

# Sesudah
THRESHOLD = 3000  # class attribute
if best_match and min_dist < self.THRESHOLD:
    ...
```

**Dampak matematis:**
```
Sebelum: 4500 / 25500 = 17,6% dari jarak maksimum
Sesudah: 3000 / 25500 = 11,8% dari jarak maksimum
```

Toleransi berkurang dari 17,6% menjadi 11,8% — wajah asing harus lebih "mirip" secara
pixel-level untuk bisa dikenali. Zona "buffer" antara ambang dan maksimum bertambah.

#### Perubahan 2 — Histogram Equalization (Normalisasi Pencahayaan)

```python
# Sebelum: tidak ada preprocessing tambahan
face_roi = cv2.resize(face_roi, (100, 100))
face_roi = face_roi.flatten().astype(float)

# Sesudah: equalize setelah resize, sebelum flatten
face_roi = cv2.resize(face_roi, (100, 100))
face_roi = self._normalize(face_roi)   # cv2.equalizeHist
face_roi = face_roi.flatten().astype(float)
```

`cv2.equalizeHist` meratakan distribusi histogram intensitas gambar menggunakan CDF:

```
hist_eq(v) = round( (CDF(v) - CDF_min) / (M·N - CDF_min) × (L - 1) )
```

**Efek nyata:**
```
Sebelum equalization:
  Wajah terang: histogram menumpuk di nilai 180–220
  Wajah gelap:  histogram menumpuk di nilai 40–80
  → Pixel value berbeda jauh meski orangnya sama

Setelah equalization:
  Kedua histogram di-stretch ke rentang 0–255 secara proporsional
  → Distribusi menjadi lebih seragam terlepas dari pencahayaan asli
  → Vektor yang dihasilkan lebih konsisten untuk orang yang sama
```

> **Konsekuensi penting:** Karena preprocessing ditambahkan, **seluruh sampel lama yang
> terdaftar tanpa equalization harus didaftar ulang**. Sampel lama (raw pixel tanpa
> equalize) tidak kompatibel dengan proses pengenalan baru (yang selalu equalize sebelum
> compare). Gunakan fitur "Daftar Ulang Foto" di halaman Admin.

Perubahan ini diterapkan **konsisten** di kedua tempat:
- `register_face` — saat menyimpan sampel baru
- `recognize_face` — saat membandingkan wajah yang masuk

#### Perubahan 3 — Confidence Gap 15%

```python
# Sebelum: hanya 1 kondisi
if min_dist < 4500 and best_match:
    nama = best_match

# Sesudah: 2 kondisi (threshold + gap)
CONFIDENCE_GAP = 0.15

if best_match and min_dist < self.THRESHOLD:
    gap_ok = (second_dist == float("inf")) or (
        min_dist <= second_dist * (1 - self.CONFIDENCE_GAP)
    )
    if gap_ok:
        nama = best_match
```

Untuk memenuhi confidence gap, kandidat terbaik harus setidaknya **15% lebih dekat**
dari kandidat kedua:

```
Syarat: min_dist ≤ second_dist × (1 − 0.15)
      = second_dist × 0.85
```

**Contoh penerapan:**
```
Skenario lama (tidak terdeteksi):
  no. 1  → dist = 4100
  no. 13 → dist = 4300
  Selisih = 200; gap = 200/4300 = 4,7%  <  15% → ditolak → "Tidak Dikenal" ✓

Skenario tepat dikenali:
  no. 1  → dist = 2200
  no. 13 → dist = 3100
  Gap = (3100 - 2200)/3100 = 29%  >  15%  AND  2200 < 3000  → dikenali ✓

Hanya 1 peserta terdaftar:
  second_dist = inf → gap_ok = True (cabang pertama)
  → confidence gap tidak menghalangi deteksi ✓
```

#### Perubahan 4 — Parameter Haar Cascade (Penyesuaian Tambahan)

```python
# Sebelum
detectMultiScale(gray, 1.3, 5)
# scaleFactor=1.3, minNeighbors=5, minSize=tidak ada

# Sesudah
detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))
```

| Parameter | Sebelum | Sesudah | Efek |
|-----------|---------|---------|------|
| `scaleFactor` | `1.3` | `1.1` | Lebih banyak level skala → lebih sensitif mendeteksi wajah |
| `minNeighbors` | `5` | `4` | Sedikit lebih toleran → false positive berkurang sedikit |
| `minSize` | tidak ada | `(60, 60)` | Abaikan deteksi < 60px → kurangi false positive dari objek kecil |

---

### 18.4 Tabel Perbandingan Sebelum vs Sesudah

| Aspek | Sebelum | Sesudah | Dampak |
|-------|---------|---------|--------|
| **Threshold** | `4500` (17,6% dari max) | `3000` (11,8% dari max) | Wajah asing lebih sulit lolos |
| **Normalisasi** | Tidak ada — raw pixel | `cv2.equalizeHist` | Robust terhadap perubahan pencahayaan |
| **Confidence gap** | Tidak ada | 15% dari runner-up | Cegah salah tebak saat dua wajah mirip |
| **Second distance** | Tidak dihitung | Dilacak selama loop | Diperlukan untuk confidence gap |
| **scaleFactor** | `1.3` | `1.1` | Deteksi lebih sensitif |
| **minNeighbors** | `5` | `4` | Sedikit lebih toleran |
| **minSize** | Tidak ada | `(60, 60)` | Kurangi false positive objek kecil |
| **Kompatibilitas sampel lama** | — | **Tidak kompatibel** | Sampel lama harus didaftar ulang |

---

### 18.5 Trade-off dan Pertimbangan

#### False Positive vs False Negative

Setiap perubahan threshold memiliki trade-off:

```
Threshold LEBIH RENDAH (sekarang: 3000)
  ✓ Lebih sedikit wajah asing yang dikenali (↓ false positive)
  ✗ Orang yang terdaftar mungkin tidak dikenali jika foto berkualitas rendah (↑ false negative)

Threshold LEBIH TINGGI (lama: 4500)
  ✓ Orang yang terdaftar lebih mudah dikenali (↓ false negative)
  ✗ Wajah asing lebih mudah lolos (↑ false positive)
```

Untuk sistem absensi, **false positive lebih berbahaya** dari false negative — lebih baik
seseorang tidak terabsen otomatis dan perlu input manual, daripada orang lain terabsen atas
namanya. Oleh karena itu threshold diturunkan.

#### Rekomendasi Penggunaan

Untuk hasil terbaik dengan kondisi sekarang:

1. **Daftarkan minimal 5 sampel** per peserta dari sudut wajah berbeda (tampak depan,
   sedikit kiri, sedikit kanan, dengan dan tanpa senyum).
2. **Kondisi pencahayaan konsisten** antara saat registrasi dan absensi. Meskipun
   histogram equalization membantu, perbedaan ekstrem (misal: outdoor vs indoor gelap)
   tetap bisa menurunkan akurasi.
3. **Jarak kamera 50–80 cm**, wajah menghadap langsung ke kamera.
4. Jika pengenalan terlalu sering menghasilkan "Tidak Dikenal" → gunakan "Daftar Ulang Foto"
   untuk menambah sampel dengan kondisi cahaya yang mirip kondisi saat absensi.
5. Jika masih sering salah tebak → pertimbangkan menurunkan `THRESHOLD` lebih jauh ke `2500`
   atau menaikkan `CONFIDENCE_GAP` ke `0.20`. Kedua nilai ini bisa diubah di
   `app/services/face_recognition_system.py` tanpa rebuild container (perlu restart API).

---

### 18.6 Lokasi Konstanta untuk Tuning

```python
# app/services/face_recognition_system.py

class FaceRecognitionSystem:
    THRESHOLD = 3000       # ← ubah di sini untuk tuning threshold
    CONFIDENCE_GAP = 0.15  # ← ubah di sini untuk tuning confidence gap
```

Perubahan nilai ini memerlukan **restart server** (bukan rebuild image) agar efektif,
karena nilai dibaca saat class di-load bukan saat container dibangun.

| Pertanyaan | Jawaban |
|-----------|---------|
| Framework backend | FastAPI + Uvicorn |
| Algoritma deteksi wajah | Haar Cascade (`haarcascade_frontalface_default.xml`) |
| Algoritma pengenalan | Mean Euclidean Distance (Nearest Neighbor) |
| Threshold jarak | 3000 (L2 norm) |
| Confidence gap | 15% |
| Dimensi fitur wajah | 10.000 (100×100 grayscale flatten) |
| Preprocessing | Histogram equalization (`cv2.equalizeHist`) |
| Penyimpanan model | Python pickle (`faces_data.pkl`) |
| Database | SQLite (`absensi.db`), 2 tabel: `peserta`, `absensi` |
| Auth | JWT HS256, expire 8 jam, password bcrypt |
| Frontend | React 19 + Vite 8, 6 halaman |
| Deployment | Podman Compose: API container + Nginx container |
| Upload limit | 15MB (Nginx `client_max_body_size`) |
| Interval recognition | 800ms per frame |
