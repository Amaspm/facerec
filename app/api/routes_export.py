from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.api.deps import get_db
from app.services.pdf_service import generate_monthly_pdf, generate_weekly_pdf
from app.utils.date_range import (
    build_month_label,
    build_week_label,
    get_iso_week_range,
    get_month_range,
)

router = APIRouter(prefix="/api/export/pdf", tags=["export"])


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/weekly")
def export_weekly_pdf(
    year: int = Query(..., ge=2000, le=2100),
    week: int = Query(..., ge=1, le=53),
):
    try:
        start_date, end_date = get_iso_week_range(year, week)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db = get_db()
    records   = db.get_absensi_by_range(start_date, end_date)
    peserta   = db.get_semua_peserta()          # semua murid terdaftar
    period_label = build_week_label(year, week, start_date, end_date)

    pdf_bytes = generate_weekly_pdf(records, peserta, period_label, start_date)
    filename  = f"laporan-absensi-pekan-{year}-w{week:02d}.pdf"
    return _pdf_response(pdf_bytes, filename)


@router.get("/monthly")
def export_monthly_pdf(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    try:
        start_date, end_date = get_month_range(year, month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db = get_db()
    records  = db.get_absensi_by_range(start_date, end_date)
    peserta  = db.get_semua_peserta()           # semua murid terdaftar
    period_label = build_month_label(year, month)

    pdf_bytes = generate_monthly_pdf(records, peserta, period_label)
    filename  = f"laporan-absensi-{year}-{month:02d}.pdf"
    return _pdf_response(pdf_bytes, filename)
