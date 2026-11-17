import os
import sys
import tempfile
import unittest
from datetime import date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.database import Database
from app.services.pdf_service import generate_monthly_pdf, generate_weekly_pdf
from app.utils.date_range import (
    build_month_label,
    build_week_label,
    get_iso_week_range,
    get_month_range,
)


class DateRangeTests(unittest.TestCase):
    def test_iso_week_range(self):
        start, end = get_iso_week_range(2026, 28)
        self.assertEqual(start, "2026-07-06")
        self.assertEqual(end, "2026-07-12")

    def test_month_range(self):
        start, end = get_month_range(2026, 7)
        self.assertEqual(start, "2026-07-01")
        self.assertEqual(end, "2026-07-31")

    def test_invalid_week_raises(self):
        with self.assertRaises(ValueError):
            get_iso_week_range(2026, 0)

    def test_invalid_month_raises(self):
        with self.assertRaises(ValueError):
            get_month_range(2026, 13)

    def test_week_label(self):
        label = build_week_label(2026, 28, "2026-07-06", "2026-07-12")
        self.assertIn("Pekan ke-28", label)
        self.assertIn("2026", label)

    def test_month_label(self):
        self.assertEqual(build_month_label(2026, 7), "Juli 2026")


class DatabaseReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.db = Database(self.tmp.name)
        self.db.tambah_peserta("01", "Ahmad")
        self.db.tambah_absensi("Ahmad", "Hadir")

    def tearDown(self):
        self.db.close()
        os.unlink(self.tmp.name)

    def test_get_absensi_by_range(self):
        today = date.today().isoformat()
        rows = self.db.get_absensi_by_range(today, today)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["nama"], "Ahmad")

    def test_get_ringkasan_kehadiran(self):
        today = date.today().isoformat()
        summary = self.db.get_ringkasan_kehadiran(today, today)
        self.assertEqual(len(summary), 1)
        self.assertEqual(summary[0]["total_hadir"], 1)


class PdfServiceTests(unittest.TestCase):
    def test_generate_weekly_pdf_returns_valid_pdf(self):
        records = [
            {
                "nomor_absen": "01",
                "nama": "Ahmad",
                "waktu": "2026-07-07 07:15:00",
                "status": "Hadir",
            }
        ]
        peserta = [{"nomor_absen": "01", "nama": "Ahmad"}]
        # start_date = Senin pekan 28 tahun 2026
        pdf = generate_weekly_pdf(records, peserta, "Pekan contoh", "2026-07-06")
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_generate_monthly_pdf_empty_data(self):
        pdf = generate_monthly_pdf([], [], "Juli 2026")
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_generate_weekly_pdf_all_students_shown(self):
        """Semua peserta harus muncul meski tidak ada absensi (TH)."""
        records = []
        peserta = [
            {"nomor_absen": "01", "nama": "Ahmad"},
            {"nomor_absen": "02", "nama": "Budi"},
        ]
        pdf = generate_weekly_pdf(records, peserta, "Pekan test", "2026-07-06")
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_generate_monthly_pdf_all_students_shown(self):
        """PDF bulanan dengan peserta tapi tanpa absensi tetap valid."""
        peserta = [
            {"nomor_absen": "01", "nama": "Ahmad"},
            {"nomor_absen": "02", "nama": "Budi"},
        ]
        pdf = generate_monthly_pdf([], peserta, "Juli 2026")
        self.assertTrue(pdf.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
