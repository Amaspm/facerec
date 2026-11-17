"""
Test Minggu 6 — JWT Auth API
Mencakup: login, token validation, protected endpoint enforcement.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

from app.main import app


class AuthApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Password default dari config (env tidak di-set → "admin123")
        cls.default_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    def _get_token(self, password=None):
        """Helper: login dan kembalikan access_token."""
        pw = password or self.default_password
        resp = self.client.post(
            "/api/auth/login",
            data={"username": "admin", "password": pw},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(resp.status_code, 200, f"Login gagal: {resp.text}")
        return resp.json()["access_token"]

    # ── Login ──────────────────────────────────────────────────────────────

    def test_login_success(self):
        token = self._get_token()
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 20)

    def test_login_wrong_password(self):
        resp = self.client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "salah_total"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(resp.status_code, 401)

    def test_login_returns_bearer_type(self):
        resp = self.client.post(
            "/api/auth/login",
            data={"username": "admin", "password": self.default_password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        data = resp.json()
        self.assertEqual(data["token_type"], "bearer")
        self.assertIn("access_token", data)

    # ── /api/auth/me ───────────────────────────────────────────────────────

    def test_me_with_valid_token(self):
        token = self._get_token()
        resp = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "authenticated")

    def test_me_without_token(self):
        resp = self.client.get("/api/auth/me")
        self.assertEqual(resp.status_code, 401)

    def test_me_with_invalid_token(self):
        resp = self.client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer token.palsu.ini"},
        )
        self.assertEqual(resp.status_code, 401)

    # ── Protected endpoints — tanpa token harus 401 ────────────────────────

    def test_delete_attendance_requires_auth(self):
        resp = self.client.delete("/api/attendance/9999")
        self.assertEqual(resp.status_code, 401)

    def test_delete_all_attendance_requires_auth(self):
        resp = self.client.delete("/api/attendance")
        self.assertEqual(resp.status_code, 401)

    def test_delete_participant_requires_auth(self):
        resp = self.client.delete("/api/participants/00")
        self.assertEqual(resp.status_code, 401)

    def test_update_participant_requires_auth(self):
        resp = self.client.put(
            "/api/participants/00",
            json={"nama": "Test"},
        )
        self.assertEqual(resp.status_code, 401)

    # ── Public endpoints — GET tetap bisa tanpa token ─────────────────────

    def test_health_is_public(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)

    def test_attendance_list_is_public(self):
        resp = self.client.get("/api/attendance")
        self.assertEqual(resp.status_code, 200)

    def test_participants_list_is_public(self):
        resp = self.client.get("/api/participants")
        self.assertEqual(resp.status_code, 200)

    def test_export_pdf_is_public(self):
        resp = self.client.get("/api/export/pdf/monthly?year=2026&month=7")
        self.assertEqual(resp.status_code, 200)

    # ── Protected endpoint dengan token valid ─────────────────────────────

    def test_delete_nonexistent_attendance_with_auth(self):
        """Delete dengan token valid → 404 (bukan 401/403)."""
        token = self._get_token()
        resp = self.client.delete(
            "/api/attendance/999999",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
