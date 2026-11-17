import { useMemo, useState } from 'react'
import { downloadMonthlyPdf, downloadWeeklyPdf } from '../api/client'
import AlertMessage from '../components/AlertMessage'

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

// Harus didefinisikan sebelum dipakai di useState default value
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

function getIsoWeekRangeLabel(year, week) {
  try {
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const dayNum = jan4.getUTCDay() || 7
    const monday = new Date(Date.UTC(year, 0, 4 - dayNum + 1 + (week - 1) * 7))
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)
    const fmt = (d) =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
    return `${fmt(monday)} – ${fmt(sunday)}`
  } catch {
    return ''
  }
}

export default function ReportsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [week, setWeek] = useState(getISOWeekNumber(now))
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState('')
  const [alert, setAlert] = useState({ type: '', message: '' })

  const weekRangeLabel = useMemo(
    () => getIsoWeekRangeLabel(year, week),
    [year, week],
  )

  async function handleWeeklyExport(e) {
    e.preventDefault()
    setLoading('weekly')
    setAlert({ type: '', message: '' })
    try {
      await downloadWeeklyPdf(year, week)
      setAlert({ type: 'success', message: 'PDF laporan pekanan berhasil diunduh.' })
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setLoading('')
    }
  }

  async function handleMonthlyExport(e) {
    e.preventDefault()
    setLoading('monthly')
    setAlert({ type: '', message: '' })
    try {
      await downloadMonthlyPdf(year, month)
      setAlert({ type: 'success', message: 'PDF laporan bulanan berhasil diunduh.' })
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="page-grid reports-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>Export PDF Pekanan</h2>
        </div>
        <p className="panel-desc">
          Unduh laporan absensi per pekan (ISO week) berisi detail kehadiran dan ringkasan
          per peserta.
        </p>
        <form className="report-form" onSubmit={handleWeeklyExport}>
          <label>
            Tahun
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Pekan (1–53)
            <input
              type="number"
              min="1"
              max="53"
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              required
            />
          </label>
          {weekRangeLabel && (
            <p className="hint">Perkiraan rentang: {weekRangeLabel}</p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading === 'weekly'}
          >
            {loading === 'weekly' ? 'Mengunduh...' : 'Unduh PDF Pekanan'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Export PDF Bulanan</h2>
        </div>
        <p className="panel-desc">
          Unduh laporan absensi per bulan berisi seluruh record dan ringkasan kehadiran.
        </p>
        <form className="report-form" onSubmit={handleMonthlyExport}>
          <label>
            Tahun
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Bulan
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.slice(1).map((name, idx) => (
                <option key={name} value={idx + 1}>{name}</option>
              ))}
            </select>
          </label>
          <p className="hint">Periode: {MONTH_NAMES[month]} {year}</p>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading === 'monthly'}
          >
            {loading === 'monthly' ? 'Mengunduh...' : 'Unduh PDF Bulanan'}
          </button>
        </form>
      </section>

      <AlertMessage
        type={alert.type}
        message={alert.message}
        onClose={() => setAlert({ type: '', message: '' })}
      />
    </div>
  )
}
