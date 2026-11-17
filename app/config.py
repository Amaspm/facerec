import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_FILE = os.getenv("DB_FILE", str(DATA_DIR / "absensi.db"))
FACES_FILE = os.getenv("FACES_FILE", str(DATA_DIR / "faces_data.pkl"))

# Auth — set via environment variable di production
# Jika tidak di-set, gunakan default development (WARNING ditampilkan saat startup)
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")
SECRET_KEY: str = os.getenv("SECRET_KEY", secrets.token_hex(32))
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))  # 8 jam default
