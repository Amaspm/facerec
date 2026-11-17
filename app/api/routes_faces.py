from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import get_db, get_face_system
from app.api.routes_auth import get_current_admin
from app.models.schemas import (
    FaceBBox,
    MessageResponse,
    ParticipantResponse,
    ParticipantUpdateRequest,
    RecognizeBase64Request,
    RecognizeResponse,
    RecognizedFace,
    RegisterBase64Request,
    RegisterResponse,
)
from app.utils.image import decode_base64_image, read_image_from_upload, _MAX_REGISTER_WIDTH

router = APIRouter(prefix="/api/faces", tags=["faces"])


def _parse_face_key(key: str) -> tuple[str | None, str | None]:
    if key == "Tidak Dikenal" or "|" not in key:
        return None, None
    nomor, nama = key.split("|", 1)
    return nomor, nama


def _build_recognize_response(frame, auto_record: bool) -> RecognizeResponse:
    face_system = get_face_system()
    db = get_db()

    names, locations = face_system.recognize_face(frame)
    if not names:
        return RecognizeResponse(faces_detected=0, faces=[])

    # Cache nomor peserta yang masih terdaftar di DB untuk crosscheck.
    # Ini mencegah wajah lama di pkl yang sudah dihapus dari DB tetap dikenali.
    registered_nomors: set[str] = {
        p["nomor_absen"] for p in db.get_semua_peserta()
    }

    faces = []
    for key, (top, right, bottom, left) in zip(names, locations):
        nomor, nama = _parse_face_key(key)
        recognized = key != "Tidak Dikenal"

        # Jika nomor tidak ada di DB, anggap tidak dikenal meskipun pkl cocok
        if recognized and nomor and nomor not in registered_nomors:
            recognized = False
            nomor = None
            nama = None
            key = "Tidak Dikenal"

        already_attended = False
        attendance_recorded = False

        if recognized and nama:
            already_attended = db.get_absensi_hari_ini(nama) is not None
            if auto_record and not already_attended:
                db.tambah_absensi(nama, "Hadir")
                attendance_recorded = True
                already_attended = True

        faces.append(
            RecognizedFace(
                key=key,
                nomor_absen=nomor,
                nama=nama,
                recognized=recognized,
                already_attended_today=already_attended,
                attendance_recorded=attendance_recorded,
                bbox=FaceBBox(top=top, right=right, bottom=bottom, left=left),
            )
        )

    return RecognizeResponse(faces_detected=len(faces), faces=faces)


@router.post("/register", response_model=RegisterResponse)
async def register_face(
    nomor_absen: str = Form(...),
    nama: str = Form(...),
    image: UploadFile = File(...),
    _admin: str = Depends(get_current_admin),
):
    frame = await read_image_from_upload(image, max_width=_MAX_REGISTER_WIDTH)
    face_system = get_face_system()
    db = get_db()

    success, message = face_system.register_face(frame, nama.strip(), nomor_absen.strip())
    if not success:
        return RegisterResponse(
            success=False,
            message=message,
            nomor_absen=nomor_absen,
            nama=nama,
            sample_count=0,
        )

    db.tambah_peserta(nomor_absen.strip(), nama.strip())
    key = f"{nomor_absen.strip()}|{nama.strip()}"
    sample_count = len(face_system.known_faces.get(key, []))

    return RegisterResponse(
        success=True,
        message=message,
        nomor_absen=nomor_absen.strip(),
        nama=nama.strip(),
        sample_count=sample_count,
    )


@router.post("/register/base64", response_model=RegisterResponse)
async def register_face_base64(
    payload: RegisterBase64Request,
    _admin: str = Depends(get_current_admin),
):
    frame = decode_base64_image(payload.image_base64, max_width=_MAX_REGISTER_WIDTH)
    face_system = get_face_system()
    db = get_db()

    nomor = payload.nomor_absen.strip()
    nama = payload.nama.strip()
    success, message = face_system.register_face(frame, nama, nomor)
    if not success:
        return RegisterResponse(
            success=False,
            message=message,
            nomor_absen=nomor,
            nama=nama,
            sample_count=0,
        )

    db.tambah_peserta(nomor, nama)
    key = f"{nomor}|{nama}"
    sample_count = len(face_system.known_faces.get(key, []))

    return RegisterResponse(
        success=True,
        message=message,
        nomor_absen=nomor,
        nama=nama,
        sample_count=sample_count,
    )


@router.post("/detect", response_model=RecognizeResponse)
async def detect_faces(
    image: UploadFile = File(...),
):
    """Deteksi wajah dan kembalikan bbox tanpa mencatat absensi.
    Digunakan untuk live preview bbox di halaman registrasi."""
    frame = await read_image_from_upload(image, max_width=_MAX_REGISTER_WIDTH)
    return _build_recognize_response(frame, auto_record=False)


@router.post("/detect/base64", response_model=RecognizeResponse)
async def detect_faces_base64(payload: RecognizeBase64Request):
    """Deteksi wajah via base64 tanpa mencatat absensi."""
    frame = decode_base64_image(payload.image_base64, max_width=_MAX_REGISTER_WIDTH)
    return _build_recognize_response(frame, auto_record=False)


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize_face(
    image: UploadFile = File(...),
    auto_record: bool = Form(True),
):
    frame = await read_image_from_upload(image)
    return _build_recognize_response(frame, auto_record)


@router.post("/recognize/base64", response_model=RecognizeResponse)
async def recognize_face_base64(payload: RecognizeBase64Request):
    frame = decode_base64_image(payload.image_base64)
    return _build_recognize_response(frame, payload.auto_record)
