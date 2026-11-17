import calendar
from datetime import date, datetime


MONTH_NAMES_ID = [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
]


def format_date_id(value: date) -> str:
    return f"{value.day:02d} {MONTH_NAMES_ID[value.month]} {value.year}"


def get_iso_week_range(year: int, week: int) -> tuple[str, str]:
    if week < 1 or week > 53:
        raise ValueError("Pekan ISO harus antara 1 dan 53")

    try:
        start = date.fromisocalendar(year, week, 1)
        end = date.fromisocalendar(year, week, 7)
    except ValueError as exc:
        raise ValueError(f"Pekan {week} tidak valid untuk tahun {year}") from exc

    return start.isoformat(), end.isoformat()


def get_month_range(year: int, month: int) -> tuple[str, str]:
    if month < 1 or month > 12:
        raise ValueError("Bulan harus antara 1 dan 12")

    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last_day)
    return start.isoformat(), end.isoformat()


def build_week_label(year: int, week: int, start_date: str, end_date: str) -> str:
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    return (
        f"{format_date_id(start)} – {format_date_id(end)} "
        f"(Pekan ke-{week}, {year})"
    )


def build_month_label(year: int, month: int) -> str:
    return f"{MONTH_NAMES_ID[month]} {year}"


def split_waktu(waktu: str) -> tuple[str, str]:
    if " " in waktu:
        tanggal, jam = waktu.split(" ", 1)
        return tanggal, jam
    return waktu, "-"


def now_label() -> str:
    return datetime.now().strftime("%d %b %Y %H:%M")
