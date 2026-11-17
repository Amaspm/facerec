import base64

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile

# Lebar maksimum frame sebelum diproses — kurangi beban CPU recognition
# 320px cukup untuk deteksi wajah Haar cascade; muat di memori ~600KB vs 3MB
_MAX_RECOGNIZE_WIDTH = 320
# Untuk registrasi pakai resolusi sedikit lebih tinggi agar ROI wajah lebih detail
_MAX_REGISTER_WIDTH = 480


def _resize_if_needed(frame: np.ndarray, max_width: int) -> np.ndarray:
    """Resize frame secara proporsional jika lebar melebihi max_width."""
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    new_w = max_width
    new_h = int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)


def decode_uploaded_image(file_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(file_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Gambar tidak valid atau corrupt")
    return frame


async def read_image_from_upload(
    file: UploadFile,
    max_width: int = _MAX_RECOGNIZE_WIDTH,
) -> np.ndarray:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File harus berupa gambar (image/*)")
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="File gambar kosong")
    frame = decode_uploaded_image(contents)
    return _resize_if_needed(frame, max_width)


def decode_base64_image(
    image_base64: str,
    max_width: int = _MAX_RECOGNIZE_WIDTH,
) -> np.ndarray:
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(image_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Base64 tidak valid") from exc
    frame = decode_uploaded_image(image_bytes)
    return _resize_if_needed(frame, max_width)
