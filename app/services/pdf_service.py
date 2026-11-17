"""
PDF Service — Laporan Absensi
Minggu 6 rev: tabel pekanan pivot (Senin–Jumat per baris murid),
              laporan bulanan semua murid (TH jika tidak hadir).
"""
from datetime import date, timedelta
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.utils.date_range import now_label, split_waktu

# ── Styles ─────────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Heading1"],
            fontSize=15, spaceAfter=4,
            textColor=colors.HexColor("#1a365d"),
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle", parent=base["Normal"],
            fontSize=9, textColor=colors.HexColor("#4a5568"), spaceAfter=3,
        ),
        "section": ParagraphStyle(
            "SectionTitle", parent=base["Heading2"],
            fontSize=11, spaceBefore=10, spaceAfter=5,
            textColor=colors.HexColor("#2d3748"),
        ),
        "empty": ParagraphStyle(
            "EmptyNote", parent=base["Normal"],
            fontSize=9, textColor=colors.HexColor("#718096"), spaceAfter=6,
        ),
    }


def _base_table_style(header_bg=colors.HexColor("#2b6cb0")) -> list:
    return [
        ("BACKGROUND",   (0, 0), (-1, 0),  header_bg),
        ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 8),
        ("ALIGN",        (0, 0), (-1, 0),  "CENTER"),
        ("ALIGN",        (0, 1), (-1, -1), "CENTER"),
        ("ALIGN",        (1, 1), (1, -1),  "LEFT"),   # kolom Nama left-align
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7fafc")]),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
    ]


HARI_ID = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]

# ── Weekly pivot ────────────────────────────────────────────────────────────

def _iso_weekdays_in_range(start_date_str: str) -> list[date]:
    """Kembalikan tanggal Senin–Jumat dari ISO week yang dimulai start_date_str."""
    monday = date.fromisoformat(start_date_str)
    return [monday + timedelta(days=i) for i in range(5)]


def _build_weekly_pivot(
    records: list[dict],
    peserta: list[dict],
    week_dates: list[date],
) -> list[list]:
    """
    Bangun tabel pivot:
      baris  = peserta (urut nomor absen)
      kolom  = No Absen | Nama | Senin | Waktu | Selasa | Waktu | ... | Jumat | Waktu

    Kembali: list of rows (header + data)
    """
    # Indeks absensi: (nomor_absen, tanggal) → waktu jam
    absen_index: dict[tuple, str] = {}
    for r in records:
        tanggal, jam = split_waktu(r["waktu"])
        key = (r["nomor_absen"], tanggal)
        # Simpan waktu pertama jika ada ganda
        if key not in absen_index:
            absen_index[key] = jam

    # Header dua baris — pakai merge untuk No/Nama, dan per hari
    # Karena ReportLab Table tidak native merge di konstruksi list,
    # kita buat satu baris header flat dengan span styling
    header = ["No\nAbsen", "Nama"]
    for hari in HARI_ID:
        header += [hari, "Waktu"]

    rows = [header]
    for p in peserta:
        nomor = p["nomor_absen"]
        nama  = p["nama"]
        row   = [nomor, nama]
        for d in week_dates:
            tanggal_str = d.isoformat()
            jam = absen_index.get((nomor, tanggal_str))
            if jam:
                row += ["H", jam[:5]]   # jam format HH:MM
            else:
                row += ["TH", "-"]
        rows.append(row)

    return rows


def _weekly_table_style(n_rows: int) -> TableStyle:
    styles = _base_table_style(header_bg=colors.HexColor("#2b6cb0"))

    # Warna sel H = hijau muda, TH = merah muda
    for col_offset in range(5):          # 5 hari
        status_col = 2 + col_offset * 2  # kolom H/TH
        time_col   = status_col + 1
        for row in range(1, n_rows):
            # Styling dinamis diset lewat loop TEXTCOLOR per cell
            styles += [
                ("FONTNAME", (status_col, row), (status_col, row), "Helvetica-Bold"),
            ]

    return TableStyle(styles)


def _colorize_weekly_table(table, rows: list[list], base_cmds: list):
    """Kembalikan list commands style lengkap dengan warna H/TH."""
    cmds = list(base_cmds)
    for row_idx, row in enumerate(rows[1:], start=1):
        for day_idx in range(5):
            col = 2 + day_idx * 2
            val = row[col] if col < len(row) else ""
            if val == "H":
                cmds += [
                    ("TEXTCOLOR",  (col, row_idx), (col, row_idx), colors.HexColor("#276749")),
                    ("BACKGROUND", (col, row_idx), (col, row_idx), colors.HexColor("#f0fff4")),
                    ("FONTNAME",   (col, row_idx), (col, row_idx), "Helvetica-Bold"),
                ]
            elif val == "TH":
                cmds += [
                    ("TEXTCOLOR",  (col, row_idx), (col, row_idx), colors.HexColor("#c53030")),
                    ("BACKGROUND", (col, row_idx), (col, row_idx), colors.HexColor("#fff5f5")),
                    ("FONTNAME",   (col, row_idx), (col, row_idx), "Helvetica-Bold"),
                ]
    return cmds


def _build_weekly_table(rows: list[list], page_width: float) -> Table:
    # Lebar: No(1.3) + Nama(3.8) + 5×(Hari 1.4 + Waktu 1.4) = 5.1 + 14 = 19.1cm
    # Landscape A4 usable ≈ 25.7cm, margin 1.5 kiri+kanan → 25.7 - 3 = 22.7cm
    no_w    = 1.3 * cm
    nama_w  = 4.2 * cm
    hari_w  = 1.5 * cm
    waktu_w = 1.5 * cm
    col_widths = [no_w, nama_w] + [hari_w, waktu_w] * 5

    table = Table(rows, colWidths=col_widths, repeatRows=1)
    base_cmds = _base_table_style(header_bg=colors.HexColor("#2b6cb0"))
    all_cmds  = _colorize_weekly_table(table, rows, base_cmds)
    table.setStyle(TableStyle(all_cmds))
    return table


# ── Monthly detail + ringkasan ──────────────────────────────────────────────

def _build_monthly_detail_table(
    records: list[dict],
    peserta: list[dict],
) -> Table:
    """Tabel detail absensi bulanan — semua murid tampil, TH jika tidak ada record."""
    # Kumpulkan tanggal unik yang ada absensi (untuk kolom tanggal)
    # Format: daftar record dikelompokkan per peserta
    # Tabel: No Absen | Nama | Tanggal | Waktu | Status
    data = [["No. Absen", "Nama", "Tanggal", "Waktu", "Status"]]

    # Index absensi per nomor_absen → list record
    from collections import defaultdict
    index: dict[str, list] = defaultdict(list)
    for r in records:
        index[r["nomor_absen"]].append(r)

    for p in peserta:
        nomor = p["nomor_absen"]
        nama  = p["nama"]
        recs  = index.get(nomor, [])
        if recs:
            for r in recs:
                tanggal, jam = split_waktu(r["waktu"])
                data.append([nomor, nama, tanggal, jam[:5] if jam != "-" else "-", r["status"]])
        else:
            data.append([nomor, nama, "-", "-", "TH"])

    col_widths = [2.2 * cm, 5 * cm, 3 * cm, 2.5 * cm, 2.3 * cm]
    table = Table(data, colWidths=col_widths, repeatRows=1)

    all_cmds = list(_base_table_style())
    for row_idx, row in enumerate(data[1:], start=1):
        if row[4] == "TH":
            all_cmds += [
                ("TEXTCOLOR",  (4, row_idx), (4, row_idx), colors.HexColor("#c53030")),
                ("BACKGROUND", (0, row_idx), (-1, row_idx), colors.HexColor("#fff5f5")),
                ("FONTNAME",   (4, row_idx), (4, row_idx), "Helvetica-Bold"),
            ]
    table.setStyle(TableStyle(all_cmds))
    return table


def _build_monthly_summary_table(
    peserta: list[dict],
    records: list[dict],
    start_date: str,
    end_date: str,
) -> Table:
    """Ringkasan: setiap peserta + total hadir + total kerja (hari kerja dalam bulan)."""
    from collections import defaultdict
    hadir_count: dict[str, int] = defaultdict(int)
    for r in records:
        hadir_count[r["nomor_absen"]] += 1

    # Hitung hari kerja (Senin–Jumat) dalam rentang
    hari_kerja = 0
    d = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    while d <= end:
        if d.weekday() < 5:
            hari_kerja += 1
        d += timedelta(days=1)

    data = [["No. Absen", "Nama", "Hari Hadir", f"Hari Kerja ({hari_kerja})", "Kehadiran (%)"]]
    for p in peserta:
        nomor  = p["nomor_absen"]
        hadir  = hadir_count.get(nomor, 0)
        persen = f"{hadir / hari_kerja * 100:.0f}%" if hari_kerja else "-"
        data.append([nomor, p["nama"], str(hadir), str(hari_kerja), persen])

    col_widths = [2.2 * cm, 5 * cm, 2.8 * cm, 3.5 * cm, 3 * cm]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle(
        _base_table_style(header_bg=colors.HexColor("#2f855a"))
    ))
    return table


# ── Public generators ───────────────────────────────────────────────────────

def generate_weekly_pdf(
    records: list[dict],
    peserta: list[dict],
    period_label: str,
    start_date: str,
) -> bytes:
    """
    Laporan pekanan — tabel pivot Senin–Jumat.
    Semua murid terdaftar tampil; H/TH per hari.
    """
    week_dates = _iso_weekdays_in_range(start_date)
    rows       = _build_weekly_pivot(records, peserta, week_dates)

    buffer = BytesIO()
    # Gunakan landscape karena tabel lebar (12 kolom)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm,  bottomMargin=1.5 * cm,
    )
    styles = _styles()
    page_width = landscape(A4)[0] - 3 * cm

    # Baris hari di header dengan tanggal
    hari_dengan_tgl = []
    for i, d in enumerate(week_dates):
        hari_dengan_tgl.append(f"{HARI_ID[i]}\n{d.strftime('%d/%m')}")

    # Rebuild header dengan tanggal
    rows[0] = ["No\nAbsen", "Nama"]
    for label in hari_dengan_tgl:
        rows[0] += [label, "Waktu"]

    elements = [
        Paragraph("LAPORAN ABSENSI PEKANAN", styles["title"]),
        Paragraph(f"Periode: {period_label}", styles["subtitle"]),
        Paragraph(f"Dicetak: {now_label()}", styles["subtitle"]),
        Spacer(1, 0.3 * cm),
        Paragraph("Keterangan: H = Hadir, TH = Tidak Hadir", styles["subtitle"]),
        Spacer(1, 0.3 * cm),
    ]

    if len(rows) > 1:
        elements.append(_build_weekly_table(rows, page_width))
    else:
        elements.append(
            Paragraph(
                "Belum ada peserta terdaftar.", styles["empty"]
            )
        )

    doc.build(elements)
    return buffer.getvalue()


def generate_monthly_pdf(
    records: list[dict],
    peserta: list[dict],
    period_label: str,
) -> bytes:
    """
    Laporan bulanan — semua murid tampil, TH jika tidak ada absensi.
    """
    # Hitung start/end dari records atau period_label — ambil dari records
    start_date = end_date = None
    if records:
        dates = sorted(r["waktu"][:10] for r in records)
        start_date = dates[0]
        end_date   = dates[-1]
    else:
        # Fallback: tidak ada records → summary tetap muncul dengan 0 hadir
        start_date = end_date = date.today().isoformat()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm,  bottomMargin=1.5 * cm,
    )
    styles = _styles()
    elements = [
        Paragraph("LAPORAN ABSENSI BULANAN", styles["title"]),
        Paragraph(f"Periode: {period_label}", styles["subtitle"]),
        Paragraph(f"Dicetak: {now_label()}", styles["subtitle"]),
        Spacer(1, 0.4 * cm),
        Paragraph("Detail Absensi", styles["section"]),
    ]

    if peserta:
        elements.append(_build_monthly_detail_table(records, peserta))
    else:
        elements.append(
            Paragraph("Tidak ada peserta terdaftar.", styles["empty"])
        )

    elements.append(Paragraph("Ringkasan Kehadiran Bulanan", styles["section"]))

    if peserta:
        elements.append(
            _build_monthly_summary_table(peserta, records, start_date, end_date)
        )
    else:
        elements.append(
            Paragraph("Tidak ada data ringkasan.", styles["empty"])
        )

    doc.build(elements)
    return buffer.getvalue()
