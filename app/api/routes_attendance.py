from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.api.deps import get_db, get_face_system
from app.api.routes_auth import get_current_admin
from app.models.schemas import (
    AttendanceCreateRequest,
    AttendanceListResponse,
    AttendanceRecord,
    AttendanceUpdateRequest,
    MessageResponse,
    ParticipantFullUpdateRequest,
    ParticipantResponse,
    ParticipantUpdateRequest,
)

router_attendance = APIRouter(prefix="/api/attendance", tags=["attendance"])
router_participants = APIRouter(prefix="/api/participants", tags=["participants"])


@router_attendance.get("", response_model=AttendanceListResponse)
def list_attendance(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    start_date: str | None = Query(None, description="Format YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Format YYYY-MM-DD"),
):
    db = get_db()
    items = db.get_semua_absensi(
        limit=limit, offset=offset, start_date=start_date, end_date=end_date
    )
    total = db.count_absensi(start_date=start_date, end_date=end_date)
    return AttendanceListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[AttendanceRecord(**item) for item in items],
    )


@router_attendance.post("", response_model=AttendanceRecord, status_code=201)
def create_attendance(
    payload: AttendanceCreateRequest,
    _admin: str = Depends(get_current_admin),
):
    db = get_db()

    peserta = db.get_peserta_by_nomor(payload.nomor_absen)
    if not peserta:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    # Gunakan waktu kustom jika disediakan, otherwise pakai waktu sekarang
    from datetime import datetime as dt
    waktu = payload.waktu or dt.now().strftime("%Y-%m-%d %H:%M:%S")

    # Validasi format waktu
    try:
        dt.strptime(waktu, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        raise HTTPException(status_code=422, detail="Format waktu harus YYYY-MM-DD HH:MM:SS")

    record = db.tambah_absensi_dengan_waktu(payload.nomor_absen, waktu, payload.status)
    if not record:
        raise HTTPException(status_code=500, detail="Gagal menyimpan absensi")
    return AttendanceRecord(**record)


@router_attendance.patch("/{id_absensi}", response_model=AttendanceRecord)
def update_attendance(
    id_absensi: int,
    payload: AttendanceUpdateRequest,
    _admin: str = Depends(get_current_admin),
):
    db = get_db()

    # Pastikan record ada
    existing = db.get_absensi_by_id(id_absensi)
    if not existing:
        raise HTTPException(status_code=404, detail="Record absensi tidak ditemukan")

    # Pastikan peserta terdaftar
    if not db.get_peserta_by_nomor(payload.nomor_absen):
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    # Validasi format waktu
    from datetime import datetime as dt
    try:
        dt.strptime(payload.waktu, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        raise HTTPException(status_code=422, detail="Format waktu harus YYYY-MM-DD HH:MM:SS")

    record = db.update_absensi(id_absensi, payload.nomor_absen, payload.waktu, payload.status)
    if not record:
        raise HTTPException(status_code=500, detail="Gagal mengupdate absensi")
    return AttendanceRecord(**record)


@router_attendance.delete("/{id_absensi}", response_model=MessageResponse)
def delete_attendance(
    id_absensi: int,
    _admin: str = Depends(get_current_admin),
):
    db = get_db()
    if not db.hapus_absensi(id_absensi):
        raise HTTPException(status_code=404, detail="Record absensi tidak ditemukan")
    return MessageResponse(success=True, message="Record absensi berhasil dihapus")


@router_attendance.delete("", response_model=MessageResponse)
def delete_all_attendance(_admin: str = Depends(get_current_admin)):
    db = get_db()
    db.hapus_semua_absensi()
    return MessageResponse(success=True, message="Semua log absensi berhasil dihapus")


@router_participants.get("", response_model=list[ParticipantResponse])
def list_participants():
    face_system = get_face_system()
    sample_counts = {}
    for key, samples in face_system.known_faces.items():
        if "|" in key:
            nomor = key.split("|", 1)[0]
            sample_counts[nomor] = len(samples)

    db = get_db()
    participants = db.get_semua_peserta()
    return [
        ParticipantResponse(
            nomor_absen=p["nomor_absen"],
            nama=p["nama"],
            sample_count=sample_counts.get(p["nomor_absen"], 0),
        )
        for p in participants
    ]


@router_participants.put("/{nomor_absen}", response_model=ParticipantResponse)
def update_participant(
    nomor_absen: str,
    payload: ParticipantUpdateRequest,
    _admin: str = Depends(get_current_admin),
):
    db = get_db()
    face_system = get_face_system()

    peserta = db.get_peserta_by_nomor(nomor_absen)
    if not peserta:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    new_name = payload.nama.strip()
    old_key = face_system.get_face_key_by_nomor(nomor_absen)

    if old_key:
        if not face_system.edit_face_name(old_key, new_name):
            raise HTTPException(status_code=500, detail="Gagal mengubah data wajah")
    else:
        db.update_nama_peserta_by_nomor(nomor_absen, new_name)
        return ParticipantResponse(
            nomor_absen=nomor_absen, nama=new_name, sample_count=0
        )

    db.update_nama_peserta_by_nomor(nomor_absen, new_name)
    new_key = f"{nomor_absen}|{new_name}"
    sample_count = len(face_system.known_faces.get(new_key, []))

    return ParticipantResponse(
        nomor_absen=nomor_absen, nama=new_name, sample_count=sample_count
    )


@router_participants.delete("/{nomor_absen}", response_model=MessageResponse)
def delete_participant(
    nomor_absen: str,
    _admin: str = Depends(get_current_admin),
):
    db = get_db()
    face_system = get_face_system()

    peserta = db.get_peserta_by_nomor(nomor_absen)
    if not peserta:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    # Hapus dari DB dulu — jika server restart setelah ini, pkl-nya sudah
    # tidak punya padanan di DB sehingga recognize akan di-skip.
    db.hapus_peserta_by_nomor(nomor_absen)
    # Hapus dari memory + tulis pkl; kalau langkah ini gagal, wajah memang
    # masih ada di pkl, tapi tidak akan di-kenali karena DB sudah bersih.
    face_system.delete_face_by_nomor(nomor_absen)

    return MessageResponse(
        success=True,
        message=f"Peserta {peserta['nama']} berhasil dihapus",
    )


@router_participants.get("/{nomor_absen}/face-image")
def get_participant_face_image(nomor_absen: str):
    """Kembalikan foto wajah pertama peserta sebagai JPEG.
    Response 404 jika tidak ada data wajah."""
    import cv2
    import numpy as np

    face_system = get_face_system()
    key = face_system.get_face_key_by_nomor(nomor_absen)
    if not key or key not in face_system.known_faces:
        raise HTTPException(status_code=404, detail="Data wajah tidak ditemukan")

    samples = face_system.known_faces[key]
    if not samples:
        raise HTTPException(status_code=404, detail="Data wajah kosong")

    face_arr = np.array(samples[0]).reshape(100, 100).astype(np.uint8)
    # Konversi grayscale → BGR agar bisa di-encode JPEG
    face_bgr = cv2.cvtColor(face_arr, cv2.COLOR_GRAY2BGR)
    # Scale up 2x agar lebih jelas di UI
    face_bgr = cv2.resize(face_bgr, (200, 200), interpolation=cv2.INTER_NEAREST)
    ok, buf = cv2.imencode(".jpg", face_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise HTTPException(status_code=500, detail="Gagal encode gambar wajah")

    return Response(
        content=buf.tobytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache"},
    )


@router_participants.patch("/{nomor_absen}", response_model=ParticipantResponse)
def patch_participant(
    nomor_absen: str,
    payload: ParticipantFullUpdateRequest,
    _admin: str = Depends(get_current_admin),
):
    """Update nomor absen dan/atau nama peserta sekaligus."""
    db = get_db()
    face_system = get_face_system()

    peserta = db.get_peserta_by_nomor(nomor_absen)
    if not peserta:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    current_nomor = nomor_absen
    current_nama  = peserta["nama"]

    # Update nomor absen jika berubah
    if payload.nomor_absen and payload.nomor_absen.strip() != current_nomor:
        new_nomor = payload.nomor_absen.strip()
        ok, msg = db.update_nomor_absen_peserta(current_nomor, new_nomor)
        if not ok:
            raise HTTPException(status_code=409, detail=msg)
        face_system.rename_nomor_absen(current_nomor, new_nomor)
        current_nomor = new_nomor

    # Update nama jika berubah
    if payload.nama and payload.nama.strip() != current_nama:
        new_nama = payload.nama.strip()
        old_key  = face_system.get_face_key_by_nomor(current_nomor)
        if old_key:
            face_system.edit_face_name(old_key, new_nama)
        db.update_nama_peserta_by_nomor(current_nomor, new_nama)
        current_nama = new_nama

    new_key      = f"{current_nomor}|{current_nama}"
    sample_count = len(face_system.known_faces.get(new_key, []))
    return ParticipantResponse(
        nomor_absen=current_nomor,
        nama=current_nama,
        sample_count=sample_count,
    )


@router_participants.delete("/{nomor_absen}/face-samples", response_model=MessageResponse)
def reset_face_samples(
    nomor_absen: str,
    _admin: str = Depends(get_current_admin),
):
    """Hapus semua sampel wajah peserta tanpa menghapus data peserta.
    Gunakan sebelum daftar ulang foto."""
    db = get_db()
    face_system = get_face_system()

    peserta = db.get_peserta_by_nomor(nomor_absen)
    if not peserta:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    key = face_system.get_face_key_by_nomor(nomor_absen)
    if key and key in face_system.known_faces:
        face_system.known_faces[key] = []
        face_system.save_faces()

    return MessageResponse(
        success=True,
        message=f"Sampel wajah {peserta['nama']} berhasil dihapus. Silakan daftar ulang.",
    )
