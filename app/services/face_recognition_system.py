import os
import pickle

import cv2
import numpy as np

from app.config import FACES_FILE


class FaceRecognitionSystem:
    def __init__(self, faces_file: str | None = None):
        self.faces_file = faces_file or FACES_FILE
        self.known_faces = {}
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.load_faces()

    def load_faces(self):
        if os.path.exists(self.faces_file):
            with open(self.faces_file, "rb") as f:
                self.known_faces = pickle.load(f)

    def save_faces(self):
        os.makedirs(os.path.dirname(self.faces_file) or ".", exist_ok=True)
        with open(self.faces_file, "wb") as f:
            pickle.dump(self.known_faces, f)

    # ── Konstanta akurasi ─────────────────────────────────────────────────────
    # Turunkan dari 4500 → 3000 agar wajah asing lebih sulit lolos (Solusi 1)
    THRESHOLD = 3000
    # Kandidat terbaik harus setidaknya X% lebih dekat dari kandidat kedua.
    # Cegah situasi "hampir seri" yang rawan salah tebak (Solusi 4)
    CONFIDENCE_GAP = 0.15   # 15%

    def _normalize(self, face_gray: np.ndarray) -> np.ndarray:
        """Histogram equalization → invariant terhadap pencahayaan (Solusi 3)."""
        return cv2.equalizeHist(face_gray)

    def register_face(self, frame, nama, nomor_absen):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60)
        )

        if len(faces) == 0:
            return False, "Wajah tidak terdeteksi"
        if len(faces) > 1:
            return False, "Terdeteksi lebih dari 1 wajah"

        x, y, w, h = faces[0]
        face_roi = gray[y : y + h, x : x + w]
        face_roi = cv2.resize(face_roi, (100, 100))
        face_roi = self._normalize(face_roi)   # Solusi 3

        key = f"{nomor_absen}|{nama}"
        if key not in self.known_faces:
            self.known_faces[key] = []

        self.known_faces[key].append(face_roi.flatten().astype(float))
        self.save_faces()
        return True, "Registrasi berhasil"

    def recognize_face(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60)
        )

        if len(faces) == 0:
            return None, []

        recognized_names = []
        face_locations = []

        for (x, y, w, h) in faces:
            face_roi = gray[y : y + h, x : x + w]
            face_roi = cv2.resize(face_roi, (100, 100))
            face_roi = self._normalize(face_roi)   # Solusi 3
            face_roi = face_roi.flatten().astype(float)

            nama = "Tidak Dikenal"
            min_dist = float("inf")
            second_dist = float("inf")
            best_match = None

            for key, known_faces_list in self.known_faces.items():
                distances = [np.linalg.norm(face_roi - kf) for kf in known_faces_list]
                if distances:
                    avg_dist = np.mean(distances)
                    if avg_dist < min_dist:
                        second_dist = min_dist   # geser yang lama jadi kedua
                        min_dist = avg_dist
                        best_match = key
                    elif avg_dist < second_dist:
                        second_dist = avg_dist

            # Solusi 1: threshold lebih ketat
            if best_match and min_dist < self.THRESHOLD:
                # Solusi 4: confidence gap — kandidat terbaik harus cukup
                # lebih dekat dari kandidat kedua, bukan hampir seri.
                # Jika hanya ada 1 orang terdaftar, second_dist = inf → gap selalu terpenuhi.
                gap_ok = (second_dist == float("inf")) or (
                    min_dist <= second_dist * (1 - self.CONFIDENCE_GAP)
                )
                if gap_ok:
                    nama = best_match

            recognized_names.append(nama)
            face_locations.append((y, x + w, y + h, x))

        return recognized_names, face_locations

    def get_registered_faces(self):
        result = []
        for key, faces_list in self.known_faces.items():
            if faces_list:
                nomor, nama = key.split("|", 1)
                face_img = faces_list[0].reshape(100, 100).astype(np.uint8)
                result.append((nomor, nama, face_img))
        return result

    def edit_face_name(self, old_key, new_name):
        if old_key in self.known_faces:
            nomor = old_key.split("|", 1)[0]
            new_key = f"{nomor}|{new_name}"
            self.known_faces[new_key] = self.known_faces.pop(old_key)
            self.save_faces()
            return True
        return False

    def rename_nomor_absen(self, old_nomor: str, new_nomor: str) -> bool:
        """Ganti nomor absen di data wajah (key: nomor|nama)."""
        renamed = False
        for old_key in list(self.known_faces.keys()):
            if old_key.startswith(f"{old_nomor}|"):
                nama = old_key.split("|", 1)[1]
                new_key = f"{new_nomor}|{nama}"
                self.known_faces[new_key] = self.known_faces.pop(old_key)
                renamed = True
        if renamed:
            self.save_faces()
        return renamed

    def edit_face_name_by_nomor(self, nomor_absen, new_name):
        for key in list(self.known_faces.keys()):
            if key.startswith(f"{nomor_absen}|"):
                return self.edit_face_name(key, new_name)
        return False

    def delete_face(self, key):
        if key in self.known_faces:
            del self.known_faces[key]
            self.save_faces()
            return True
        return False

    def delete_face_by_nomor(self, nomor_absen):
        """Hapus SEMUA key yang berawalan nomor_absen| lalu simpan sekali."""
        keys_to_delete = [
            k for k in self.known_faces if k.startswith(f"{nomor_absen}|")
        ]
        if not keys_to_delete:
            return False
        for key in keys_to_delete:
            del self.known_faces[key]
        self.save_faces()
        return True

    def get_face_key_by_nomor(self, nomor_absen):
        for key in self.known_faces.keys():
            if key.startswith(f"{nomor_absen}|"):
                return key
        return None
