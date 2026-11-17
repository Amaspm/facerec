import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import get_db, get_face_system
from app.api.routes_attendance import router_attendance, router_participants
from app.api.routes_auth import router as auth_router
from app.api.routes_export import router as export_router
from app.api.routes_faces import router as faces_router
from app.config import ADMIN_PASSWORD, DATA_DIR, DB_FILE, FACES_FILE
from app.models.schemas import HealthResponse

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db()
    get_face_system()
    if ADMIN_PASSWORD == "admin123":
        logger.warning(
            "⚠️  Menggunakan password admin default 'admin123'. "
            "Set environment variable ADMIN_PASSWORD untuk production!"
        )
    yield
    get_db().close()


app = FastAPI(
    title="Sistem Absensi Wajah API",
    description="Backend web untuk sistem absensi berbasis pengenalan wajah",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(faces_router)
app.include_router(router_attendance)
app.include_router(router_participants)
app.include_router(export_router)


@app.get("/api/health", response_model=HealthResponse, tags=["system"])
def health_check():
    db = get_db()
    face_system = get_face_system()
    return HealthResponse(
        status="ok",
        service="facerec-api",
        registered_faces=len(face_system.known_faces),
        participants=len(db.get_semua_peserta()),
    )


@app.get("/", tags=["system"])
def root():
    return {
        "message": "Sistem Absensi Wajah API",
        "docs": "/docs",
        "health": "/api/health",
        "data_dir": str(DATA_DIR),
        "db_file": DB_FILE,
        "faces_file": FACES_FILE,
    }
