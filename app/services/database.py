import sqlite3
from datetime import datetime

from app.config import DB_FILE


class Database:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or DB_FILE
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.create_tables()

    def create_tables(self):
        cursor = self.conn.cursor()
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS peserta
               (nomor_absen TEXT PRIMARY KEY,
                nama TEXT NOT NULL)"""
        )
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS absensi
               (id INTEGER PRIMARY KEY AUTOINCREMENT,
                nomor_absen TEXT NOT NULL,
                nama TEXT NOT NULL,
                waktu TEXT NOT NULL,
                status TEXT NOT NULL)"""
        )
        self.conn.commit()

    def tambah_peserta(self, nomor_absen, nama):
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO peserta (nomor_absen, nama) VALUES (?, ?)",
            (nomor_absen, nama),
        )
        self.conn.commit()

    def get_peserta(self, nama):
        cursor = self.conn.cursor()
        cursor.execute("SELECT nomor_absen FROM peserta WHERE nama=?", (nama,))
        row = cursor.fetchone()
        return row[0] if row else "-"

    def get_peserta_by_nomor(self, nomor_absen):
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT nomor_absen, nama FROM peserta WHERE nomor_absen=?",
            (nomor_absen,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_semua_peserta(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT nomor_absen, nama FROM peserta ORDER BY nomor_absen")
        return [dict(row) for row in cursor.fetchall()]

    def hapus_peserta(self, nama):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM peserta WHERE nama=?", (nama,))
        self.conn.commit()

    def hapus_peserta_by_nomor(self, nomor_absen):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM peserta WHERE nomor_absen=?", (nomor_absen,))
        self.conn.commit()

    def update_nama_peserta(self, old_name, new_name):
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE peserta SET nama=? WHERE nama=?", (new_name, old_name)
        )
        cursor.execute(
            "UPDATE absensi SET nama=? WHERE nama=?", (new_name, old_name)
        )
        self.conn.commit()

    def update_nama_peserta_by_nomor(self, nomor_absen, new_name):
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE peserta SET nama=? WHERE nomor_absen=?",
            (new_name, nomor_absen),
        )
        cursor.execute(
            "UPDATE absensi SET nama=? WHERE nomor_absen=?",
            (new_name, nomor_absen),
        )
        self.conn.commit()

    def update_nomor_absen_peserta(self, old_nomor: str, new_nomor: str):
        """Ubah nomor absen — update peserta + absensi, cek duplikat lebih dulu."""
        cursor = self.conn.cursor()
        # Pastikan nomor baru belum dipakai peserta lain
        cursor.execute(
            "SELECT nomor_absen FROM peserta WHERE nomor_absen=? AND nomor_absen!=?",
            (new_nomor, old_nomor),
        )
        if cursor.fetchone():
            return False, "Nomor absen sudah digunakan peserta lain"
        cursor.execute(
            "UPDATE peserta SET nomor_absen=? WHERE nomor_absen=?",
            (new_nomor, old_nomor),
        )
        cursor.execute(
            "UPDATE absensi SET nomor_absen=? WHERE nomor_absen=?",
            (new_nomor, old_nomor),
        )
        self.conn.commit()
        return True, "Nomor absen berhasil diubah"

    def tambah_absensi(self, nama, status="Hadir"):
        cursor = self.conn.cursor()
        waktu = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        nomor_absen = self.get_peserta(nama)
        cursor.execute(
            "INSERT INTO absensi (nomor_absen, nama, waktu, status) VALUES (?, ?, ?, ?)",
            (nomor_absen, nama, waktu, status),
        )
        self.conn.commit()
        return self.get_absensi_by_id(cursor.lastrowid)

    def tambah_absensi_dengan_waktu(self, nomor_absen: str, waktu: str, status: str):
        """Tambah absensi manual — peserta dipilih by nomor_absen, waktu bebas."""
        peserta = self.get_peserta_by_nomor(nomor_absen)
        if not peserta:
            return None
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO absensi (nomor_absen, nama, waktu, status) VALUES (?, ?, ?, ?)",
            (nomor_absen, peserta["nama"], waktu, status),
        )
        self.conn.commit()
        return self.get_absensi_by_id(cursor.lastrowid)

    def update_absensi(self, id_absensi: int, nomor_absen: str, waktu: str, status: str):
        """Edit record absensi — ganti peserta, waktu, dan status."""
        peserta = self.get_peserta_by_nomor(nomor_absen)
        if not peserta:
            return None
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE absensi SET nomor_absen=?, nama=?, waktu=?, status=? WHERE id=?",
            (nomor_absen, peserta["nama"], waktu, status, id_absensi),
        )
        self.conn.commit()
        if cursor.rowcount == 0:
            return None
        return self.get_absensi_by_id(id_absensi)

    def get_absensi_by_id(self, id_absensi):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM absensi WHERE id=?", (id_absensi,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def hapus_absensi(self, id_absensi):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM absensi WHERE id=?", (id_absensi,))
        self.conn.commit()
        return cursor.rowcount > 0

    def hapus_semua_absensi(self):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM absensi")
        self.conn.commit()

    def get_absensi_hari_ini(self, nama):
        cursor = self.conn.cursor()
        hari_ini = datetime.now().strftime("%Y-%m-%d")
        cursor.execute(
            "SELECT * FROM absensi WHERE nama=? AND waktu LIKE ?",
            (nama, f"{hari_ini}%"),
        )
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_semua_absensi(self, limit=50, offset=0, start_date=None, end_date=None):
        cursor = self.conn.cursor()
        query = "SELECT * FROM absensi WHERE 1=1"
        params = []

        if start_date:
            query += " AND date(waktu) >= ?"
            params.append(start_date)
        if end_date:
            query += " AND date(waktu) <= ?"
            params.append(end_date)

        query += " ORDER BY waktu DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def count_absensi(self, start_date=None, end_date=None):
        cursor = self.conn.cursor()
        query = "SELECT COUNT(*) FROM absensi WHERE 1=1"
        params = []

        if start_date:
            query += " AND date(waktu) >= ?"
            params.append(start_date)
        if end_date:
            query += " AND date(waktu) <= ?"
            params.append(end_date)

        cursor.execute(query, params)
        return cursor.fetchone()[0]

    def get_absensi_by_range(self, start_date: str, end_date: str):
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT * FROM absensi
            WHERE date(waktu) BETWEEN ? AND ?
            ORDER BY waktu ASC
            """,
            (start_date, end_date),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_ringkasan_kehadiran(self, start_date: str, end_date: str):
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT nomor_absen, nama, COUNT(*) as total_hadir
            FROM absensi
            WHERE date(waktu) BETWEEN ? AND ?
            GROUP BY nomor_absen, nama
            ORDER BY nomor_absen
            """,
            (start_date, end_date),
        )
        return [dict(row) for row in cursor.fetchall()]

    def close(self):
        self.conn.close()
