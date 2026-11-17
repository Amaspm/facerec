# Dokumentasi Sistem Absensi Berbasis Pengenalan Wajah

Dokumen ini menjelaskan secara rinci komponen, library, serta algoritma yang digunakan pada proyek absensi wajah di folder ini. Fokusnya pada “bagaimana sistem bekerja” dari mulai aplikasi dijalankan sampai absensi tercatat.

Catatan: dokumentasi Haar Cascade yang lebih spesifik ada di `DOKUMENTASI_HAAR_CASCADE.md`, dan dokumentasi ringkas spesifikasi/algoritma ada di `SPESIFIKASI_TEKNOLOGI_ALGORITMA.md`. Dokumen ini melengkapi dengan gambaran arsitektur end-to-end dan detail alur runtime.

---

## 1. Gambaran Umum Sistem

Aplikasi adalah **desktop offline** berbasis Python dengan GUI Tkinter. Sistem menerima input dari webcam, lalu:

1. **Mendeteksi wajah** pada frame menggunakan **Haar Cascade Classifier** (OpenCV).
2. **Mengekstraksi fitur** sederhana dari ROI wajah (crop → resize → flatten).
3. **Mengenali identitas** dengan **Euclidean Distance** terhadap data wajah terdaftar (`faces_data.pkl`).
4. **Mencatat absensi** ke database SQLite (`absensi.db`) menggunakan aturan “satu kali per hari”.
5. Menampilkan hasil pada GUI (kotak hijau/oranye/merah + tabel riwayat).

Arsitektur modul:
- `main.py`: GUI (AbsensiApp) + loop update frame + orkestrasi.
- `face_recognition_system.py`: deteksi wajah, pengenalan, registrasi wajah.
- `database.py`: skema dan operasi CRUD untuk peserta dan absensi.

---

## 2. Teknologi (Library) yang Dipakai dan Fungsinya

### 2.1 Library yang dideklarasikan di `requirements.txt`

`requirements.txt` berisi:
- `opencv-python`
- `numpy`
- `pillow`

Selain itu, proyek memakai modul bawaan Python:
- `tkinter` (GUI)
- `sqlite3` (database lokal)
- `pickle` (serialisasi data wajah)
- `datetime` (timestamp)

### 2.2 Peran tiap library/modul dalam sistem

| Library/Modul | Dipakai di | Fungsi utama |
|---|---|---|
| `tkinter` | `main.py` | Membuat jendela aplikasi, input form, tombol, dialog, dan tabel riwayat (Treeview) |
| `cv2` (OpenCV) | `main.py`, `face_recognition_system.py` | Mengakses webcam (`VideoCapture`), konversi gambar (`cvtColor`), deteksi wajah (`CascadeClassifier.detectMultiScale`), anotasi kotak/teks (`rectangle`, `putText`) |
| `numpy` | `face_recognition_system.py` | Representasi vektor fitur wajah dan perhitungan Euclidean Distance via `np.linalg.norm` serta rata-rata via `np.mean` |
| `PIL` (Pillow) | `main.py` | Mengubah frame (array) menjadi format gambar yang dapat ditampilkan pada Tkinter |
| `sqlite3` | `database.py` | Menyimpan data peserta dan log absensi ke file lokal `absensi.db` |
| `pickle` | `face_recognition_system.py` | Menyimpan/muat data wajah terdaftar ke `faces_data.pkl` |
| `datetime` | `database.py` | Membuat timestamp waktu absensi dan menentukan “hari ini” untuk validasi duplikasi |

---

## 3. Komponen Sistem dan Tanggung Jawabnya

### 3.1 GUI Orkestrator: `main.py` (kelas `AbsensiApp`)

Kelas `AbsensiApp` mengelola:
- inisialisasi GUI (`setup_ui`)
- kontrol kamera (`start_camera`, `stop_camera`)
- loop pemrosesan frame real-time (`update_frame`)
- aksi registrasi wajah (`register_face`)
- tampilan daftar wajah terdaftar (`show_registered_faces`)
- pengeditan nama peserta (`edit_name`)
- penghapusan wajah dan log absensi (`delete_face`, `delete_selected`, `delete_all`)
- pembersihan saat jendela ditutup (`on_closing`)

State penting di aplikasi:
- `self.face_system` : instance `FaceRecognitionSystem`
- `self.db` : instance `Database`
- `self.cap` : `cv2.VideoCapture` (kamera)
- `self.running` : status kamera aktif/non-aktif
- `self.mode_var` : mode GUI aktif, nilai `"absensi"` atau `"registrasi"`
- `self.detected_today` : `set()` untuk caching identitas yang sudah terdeteksi/diabsen dalam sesi berjalan

### 3.2 Mesin Pengenalan Wajah: `face_recognition_system.py` (kelas `FaceRecognitionSystem`)

Kelas `FaceRecognitionSystem` bertanggung jawab atas:
- memuat data wajah terdaftar (`load_faces`)
- menyimpan data wajah terdaftar (`save_faces`)
- registrasi wajah baru (`register_face`)
- pengenalan wajah pada frame (`recognize_face`)
- menyediakan daftar wajah terdaftar untuk GUI (`get_registered_faces`)
- edit nama peserta pada memori dan `faces_data.pkl` (`edit_face_name`)
- hapus wajah dari memori dan `faces_data.pkl` (`delete_face`)

Struktur data utama:
- `self.known_faces`: dictionary
  - key: string identitas `"nomor_absen|nama"`
  - value: `list[np.ndarray]` berisi vektor fitur wajah (hasil flatten dari ROI 100×100)

### 3.3 Manajemen Data: `database.py` (kelas `Database`)

Kelas `Database` membungkus operasi SQLite:
- `create_tables`: membuat tabel `peserta` dan `absensi` jika belum ada
- `tambah_peserta`: insert atau replace peserta (nomor_absen, nama)
- `get_peserta`: mengambil nomor_absen berdasarkan nama
- `update_nama_peserta`: update nama peserta
- `hapus_peserta`: hapus peserta
- `tambah_absensi`: insert absensi (timestamp otomatis)
- `get_absensi_hari_ini`: cek apakah nama sudah tercatat hari ini
- `get_semua_absensi`: mengambil 50 log terbaru
- `hapus_absensi`, `hapus_semua_absensi`, `close`

---

## 4. Algoritma yang Digunakan dan Detail Fungsinya

### 4.1 Haar Cascade Classifier untuk Deteksi Wajah

Semua deteksi lokasi wajah menggunakan model:
- `haarcascade_frontalface_default.xml` (bawaan OpenCV)

Proses deteksi per frame (dalam bentuk konseptual):
1. Konversi frame BGR → grayscale
2. Panggil `detectMultiScale(gray, 1.3, 5)`
3. Keluaran adalah daftar bounding box `(x, y, w, h)`

Bounding box inilah yang dipakai untuk:
- Mode registrasi: menggambar kotak wajah (tanpa menyimpan fitur).
- Mode absensi: crop ROI wajah untuk masuk ke tahap pengenalan (Euclidean).

Parameter yang dipakai (konsisten di proyek):
- `scaleFactor = 1.3`
- `minNeighbors = 5`

Penjelasan lebih dalam tentang Haar Cascade ada di `DOKUMENTASI_HAAR_CASCADE.md`.

### 4.2 Ekstraksi Fitur Wajah (berbasis piksel grayscale)

Setelah Haar Cascade memberi bounding box `(x, y, w, h)`, fitur wajah dibuat dengan pipeline sederhana:
1. Crop ROI pada citra grayscale: `gray[y:y+h, x:x+w]`
2. Resize ROI ke `100×100`
3. Flatten ROI menjadi vektor 1D panjang **10.000 dimensi**
4. Cast ke `float`

Fitur ini tidak berupa embedding deep learning; ia adalah representasi piksel yang “diratakan”. Karena itu, performa sensitif terhadap pencahayaan, pose, dan kualitas deteksi.

### 4.3 Pengenalan Wajah dengan Euclidean Distance + Threshold

Untuk setiap wajah terdeteksi pada frame, sistem membandingkan vektor input terhadap semua vektor tersimpan di `known_faces`.

Definisi yang digunakan:
- Input vektor (wajah pada frame) = `face_roi` (100×100 flatten → 10.000-D)
- Untuk setiap identitas `key`, ada daftar sampel terdaftar `known_faces_list`

Langkah pencocokan per identitas:
1. Hitung jarak Euclidean untuk setiap sampel: `dist = ||face_roi - kf||`  
2. Ambil rata-rata jarak semua sampel identitas: `avg_dist = mean(distances)`
3. Ambil identitas dengan rata-rata jarak minimum: `best_match` dan `min_dist`

Keputusan pengenalan memakai threshold:
- Jika `min_dist < 4500` dan `best_match` valid → nama dikenali (`nama = best_match`)
- Jika tidak → `nama = "Tidak Dikenal"`

Intinya: Haar Cascade menentukan “lokasi wajah”; Euclidean menentukan “siapa” berdasarkan kedekatan vektor piksel dengan data terdaftar.

### 4.4 Validasi Absensi (anti duplikasi per hari)

Aturan bisnis: **setiap peserta hanya boleh absen 1 kali per hari**.

Mekanisme validasi ada dua lapis:
1. Cek database (`Database.get_absensi_hari_ini(nama)`):
   - SQL: `SELECT * FROM absensi WHERE nama=? AND waktu LIKE 'YYYY-MM-DD%'`
2. Cek cache sesi (`self.detected_today`):
   - Set menyimpan key identitas yang sudah “diperlakukan” pada sesi berjalan

Logika di GUI mode absensi:
- Bila wajah dikenali dan identitas belum tercatat hari ini (di DB dan/atau cache):
  - panggil `db.tambah_absensi(nama, 'Hadir')`
  - tambahkan key ke `detected_today`
  - refresh tabel riwayat
- Jika sudah tercatat: tampilan oranye + label `Sudah Absen`

### 4.5 Scheduled real-time processing (loop GUI)

Aplikasi menggunakan event loop Tkinter:
- `update_frame()` dipanggil berulang menggunakan `self.root.after(10, self.update_frame)`

Artinya sistem “memproses frame” kira-kira tiap 10 ms (tergantung beban CPU).
Tidak ada thread eksplisit: semua terjadi di event loop GUI.

---

## 5. Cara Kerja Sistem (End-to-End Runtime)

Bagian ini menjelaskan “alur konkret” dari kamera sampai absensi tercatat.

### 5.1 Startup aplikasi

Urutan saat `python main.py` dijalankan:
1. `AbsensiApp.__init__` membuat objek:
   - `FaceRecognitionSystem()` (memuat `faces_data.pkl` jika ada)
   - `Database()` (membuat tabel jika belum ada)
2. GUI dibuat (`setup_ui`)
3. Riwayat absensi awal ditampilkan (`load_history`)

### 5.2 Mengaktifkan kamera

Saat klik `Mulai Kamera`:
1. `start_camera()` mencoba indeks kamera `0`, `1`, lalu `2`
2. Untuk indeks yang berhasil dibuka:
   - `self.cap = cap`
   - `self.running = True`
   - `self.update_frame()` dimulai
3. Jika tidak ada kamera: tampilkan error.

### 5.3 Loop pemrosesan frame: `update_frame()`

Setiap iterasi:
1. Baca frame: `ret, frame = self.cap.read()`
2. Flip horizontal: `frame = cv2.flip(frame, 1)`
3. Branch berdasarkan mode:

#### A) Mode `"absensi"`
1. Panggil: `names, locations = face_system.recognize_face(frame)`
2. Untuk setiap wajah (zip `locations` dan `names`):
   - Jika label bukan `"Tidak Dikenal"`:
     - parse key `"nomor_absen|nama"` → `(nomor, nama)`
     - cek duplikasi hari ini:
       - jika sudah absen (di DB atau di `detected_today`):
         - warna oranye + label `(Sudah Absen)`
       - jika belum:
         - warna hijau + label identitas
         - insert absensi `db.tambah_absensi(nama, 'Hadir')`
         - update `detected_today`
         - refresh tabel (`load_history()`)
   - Jika `"Tidak Dikenal"`:
     - warna merah + label `Tidak Dikenal`
3. Gambar bounding box dan teks pada frame.

#### B) Mode `"registrasi"`
1. Konversi frame: `gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)`
2. Deteksi wajah langsung di GUI:
   - `faces = face_system.face_cascade.detectMultiScale(gray, 1.3, 5)`
3. Untuk setiap bounding box:
   - gambar kotak oranye + teks `Wajah Terdeteksi`

4. Konversi frame untuk tampilan Tkinter:
   - BGR → RGB
   - `Image.fromarray`
   - resize ke `640×480`
   - buat `ImageTk.PhotoImage` lalu tampilkan di `video_label`
5. Jadwalkan iterasi berikutnya: `after(10, update_frame)`

### 5.4 Registrasi wajah (saat tombol `Daftar Wajah` ditekan)

Saat pengguna mengisi:
- `No. Absen`
- `Nama`

dan klik `Daftar Wajah`:
1. `register_face()` mengambil satu frame dari kamera
2. Memanggil: `face_system.register_face(frame, nama, nomor)`
3. Validasi internal `register_face()`:
   - Jika Haar mendeteksi 0 wajah → gagal
   - Jika Haar mendeteksi >1 wajah → gagal
4. Jika tepat 1 wajah:
   - crop ROI
   - resize 100×100
   - flatten 10.000-D
   - append vektor ke `known_faces[key]`
   - simpan `faces_data.pkl`
5. Setelah sukses:
   - `db.tambah_peserta(nomor, nama)` untuk sinkronisasi tabel peserta

### 5.5 Pengeditan & penghapusan

- Edit nama:
  - `face_system.edit_face_name(old_key, new_name)` memindahkan key di dictionary `known_faces` dan simpan ke `faces_data.pkl`
  - `db.update_nama_peserta(old_name, new_name)` update di tabel `peserta`
- Hapus wajah:
  - `face_system.delete_face(key)` menghapus key di `known_faces` lalu simpan
  - `db.hapus_peserta(nama)` menghapus peserta dari DB
- Hapus log absensi:
  - pilih record pada Treeview → hapus via `db.hapus_absensi(id)`
  - refresh tabel

---

## 6. Diagram Alur Kerja Utama (Absensi dan Registrasi)

### 6.1 Diagram blok end-to-end (absensi)

```mermaid
flowchart TD
    CAM[Webcam Frame (BGR)] --> FLIP[Flip horizontal]
    FLIP --> MODE{Mode}
    MODE -->|Absensi| DET[face_cascade.detectMultiScale]
    DET --> ROI[Crop ROI wajah]
    ROI --> RESIZE[Resize 100x100]
    RESIZE --> FLAT[Flatten 10.000-D]
    FLAT --> MATCH[Euclidean Distance vs known_faces]
    MATCH --> DEC{min_dist < 4500 ?}
    DEC -->|Ya| ID[Identitas nomor|nama]
    DEC -->|Tidak| UNK["Tidak Dikenal"]
    ID --> CHECK{Sudah absen hari ini?}
    CHECK -->|Ya| DRAW_ORANGE[Kotak oranye]
    CHECK -->|Belum| INSERT[db.tambah_absensi('Hadir')]
    INSERT --> DRAW_GREEN[Kotak hijau]
    UNK --> DRAW_RED[Kotak merah]
    DRAW_ORANGE --> RENDER[Annotasi frame + tampilkan GUI]
    DRAW_GREEN --> RENDER
    DRAW_RED --> RENDER
```

### 6.2 Diagram alur registrasi (inti logika)

```mermaid
flowchart TD
    INPUT[Input No. Absen & Nama] --> FRAME[Ambil frame dari kamera]
    FRAME --> GRAY[Convert BGR to Gray]
    GRAY --> DET[Haar detectMultiScale]
    DET --> COUNT{Jumlah wajah?}
    COUNT -->|0| ERR0[Registrasi gagal: Wajah tidak terdeteksi]
    COUNT -->|>1| ERR1[Registrasi gagal: Lebih dari 1 wajah]
    COUNT -->|1| OK[Cari faces[0] -> crop ROI]
    OK --> RESIZE[Resize 100x100]
    RESIZE --> FLAT[Flatten 10.000-D]
    FLAT --> STORE[Append ke known_faces[key]]
    STORE --> SAVE[save_faces => faces_data.pkl]
    SAVE --> DB[db.tambah_peserta(nomor, nama)]
    DB --> DONE[Sukses: peserta tersimpan]
```

---

## 7. Batasan Teknis yang Berpengaruh pada Cara Kerja

1. **Haar Cascade** hanya mendeteksi wajah frontal yang jelas. Jika wajah terlalu miring/gelap → bounding box tidak ada → proses pengenalan tidak terjadi.
2. **Pengenalan memakai piksel mentah** (flatten ROI). Ini rentan terhadap perubahan pencahayaan, ekspresi, dan sedikit perubahan posisi.
3. Threshold **`4500`** bersifat empiris:
   - Terlalu kecil → banyak “Tidak Dikenal”
   - Terlalu besar → risiko false positive
4. Validasi duplikasi absensi bergantung pada `nama`:
   - Jika ada dua peserta dengan nama sama, hasil cek bisa ambigu (di proyek ini diasumsikan nama unik).

---

## 8. Ringkasan

- Deteksi wajah: **Haar Cascade** → menghasilkan bounding box.
- Ekstraksi fitur: crop ROI → resize 100×100 → flatten 10.000-D.
- Pengenalan: **Euclidean Distance** ke data terdaftar (`faces_data.pkl`) → keputusan threshold `4500`.
- Absensi: dicek duplikasi harian melalui **SQLite query** dan cache sesi (`detected_today`), lalu insert `Hadir`.
- GUI: loop real-time menggunakan `after(10)` untuk menggabungkan deteksi/annotasi dengan tampilan responsif.

Jika kamu ingin, saya bisa menambahkan lampiran “panduan eksperimen” (mis. cara mengatur `scaleFactor`, `minNeighbors`, dan threshold jarak) agar deteksi/pengenalan lebih stabil.

