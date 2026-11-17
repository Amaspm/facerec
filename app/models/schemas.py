from typing import Literal

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    success: bool
    message: str


class ParticipantResponse(BaseModel):
    nomor_absen: str
    nama: str
    sample_count: int = 0


class ParticipantUpdateRequest(BaseModel):
    nama: str = Field(..., min_length=1, max_length=100)


class ParticipantFullUpdateRequest(BaseModel):
    """Update nomor absen dan/atau nama sekaligus."""
    nomor_absen: str | None = Field(None, min_length=1, max_length=20)
    nama: str | None = Field(None, min_length=1, max_length=100)


class AttendanceRecord(BaseModel):
    id: int
    nomor_absen: str
    nama: str
    waktu: str
    status: str


class AttendanceListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[AttendanceRecord]


class AttendanceCreateRequest(BaseModel):
    nomor_absen: str = Field(..., min_length=1)
    status: str = Field("Hadir", pattern="^(Hadir|Izin|Sakit)$")
    waktu: str | None = Field(
        None,
        description="Format YYYY-MM-DD HH:MM:SS. Kosong = pakai waktu sekarang.",
    )


class AttendanceUpdateRequest(BaseModel):
    nomor_absen: str = Field(..., min_length=1)
    waktu: str = Field(..., description="Format YYYY-MM-DD HH:MM:SS")
    status: str = Field("Hadir", pattern="^(Hadir|Izin|Sakit)$")


class FaceBBox(BaseModel):
    top: int
    right: int
    bottom: int
    left: int


class RecognizedFace(BaseModel):
    key: str
    nomor_absen: str | None = None
    nama: str | None = None
    recognized: bool
    already_attended_today: bool = False
    attendance_recorded: bool = False
    bbox: FaceBBox


class RecognizeResponse(BaseModel):
    faces_detected: int
    faces: list[RecognizedFace]


class RegisterResponse(BaseModel):
    success: bool
    message: str
    nomor_absen: str
    nama: str
    sample_count: int


class RecognizeBase64Request(BaseModel):
    image_base64: str
    auto_record: bool = True


class RegisterBase64Request(BaseModel):
    image_base64: str
    nomor_absen: str = Field(..., min_length=1)
    nama: str = Field(..., min_length=1)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    registered_faces: int
    participants: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
