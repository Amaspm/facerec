from app.services.database import Database
from app.services.face_recognition_system import FaceRecognitionSystem

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
