import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

from app.main import app


class ExportApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_export_weekly_pdf(self):
        response = self.client.get("/api/export/pdf/weekly?year=2026&week=28")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn("attachment", response.headers.get("content-disposition", ""))

    def test_export_monthly_pdf(self):
        response = self.client.get("/api/export/pdf/monthly?year=2026&month=7")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_export_weekly_invalid_week(self):
        response = self.client.get("/api/export/pdf/weekly?year=2026&week=54")
        self.assertEqual(response.status_code, 422)

    def test_export_monthly_invalid_month(self):
        response = self.client.get("/api/export/pdf/monthly?year=2026&month=13")
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
