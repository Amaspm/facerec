import { useCallback, useEffect, useState } from 'react'
import {
  createAttendance,
  deleteAllAttendance,
  deleteAttendance,
  getAttendance,
  getParticipants,
  updateAttendance,
} from '../api/client'
import AlertMessage from '../components/AlertMessage'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'

const PAGE_SIZE = 20
const STATUS_OPTIONS = ['Hadir', 'Izin', 'Sakit']

// Konversi datetime-local value (YYYY-MM-DDTHH:MM) ↔ DB format (YYYY-MM-DD HH:MM:SS)
function toDbWaktu(datetimeLocal) {
  if (!datetimeLocal) return ''
  return datetimeLocal.replace('T', ' ') + ':00'
}
function toDatetimeLocal(dbWaktu) {
  if (!dbWaktu) return ''
  // "2026-07-12 07:36:03" → "2026-07-12T07:36"
  return dbWaktu.slice(0, 16).replace(' ', 'T')
}

// ── Modal: Edit record yang sudah ada ─────────────────────────────────────────
function EditModal({ record, participants, onSave, onClose }) {
  const [nomor, setNomor]   = useState(record.nomor_absen)
  const [waktu, setWaktu]   = useState(toDatetimeLocal(record.waktu))
  const [status, setStatus] = useState(record.status)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nomor || !waktu) { setErr('Semua field wajib diisi.'); return }
    setSaving(true)
    setErr('')
    try {
      await onSave(record.id, { nomor_absen: nomor, waktu: toDbWaktu(waktu), status })
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Absensi #{record.id}</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Peserta
            <select value={nomor} onChange={(e) => setNomor(e.target.value)} required>
              <option value="">— Pilih peserta —</option>
              {participants.map((p) => (
                <option key={p.nomor_absen} value={p.nomor_absen}>
                  {p.nomor_absen} — {p.nama}
                </option>
              ))}
            </select>
          </label>

          <label>
            Waktu
            <input
              type="datetime-local"
              value={waktu}
              onChange={(e) => setWaktu(e.target.value)}
              required
            />
          </label>

          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {err && <p className="modal-error">{err}</p>}

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Tambah absensi manual ──────────────────────────────────────────────
function AddModal({ participants, onSave, onClose }) {
  const now = new Date()
  const localIso = new Date(now - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  const [nomor, setNomor]   = useState('')
  const [waktu, setWaktu]   = useState(localIso)
  const [status, setStatus] = useState('Hadir')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nomor) { setErr('Pilih peserta terlebih dahulu.'); return }
    setSaving(true)
    setErr('')
    try {
      await onSave({ nomor_absen: nomor, waktu: toDbWaktu(waktu), status })
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Tambah Absensi Manual</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Peserta
            <select value={nomor} onChange={(e) => setNomor(e.target.value)} required>
              <option value="">— Pilih peserta —</option>
              {participants.map((p) => (
                <option key={p.nomor_absen} value={p.nomor_absen}>
                  {p.nomor_absen} — {p.nama}
                </option>
              ))}
            </select>
          </label>

          <label>
            Waktu
            <input
              type="datetime-local"
              value={waktu}
              onChange={(e) => setWaktu(e.target.value)}
              required
            />
          </label>

          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {err && <p className="modal-error">{err}</p>}

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Tambah'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Halaman utama ─────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [items, setItems]           = useState([])
  const [total, setTotal]           = useState(0)
  const [offset, setOffset]         = useState(0)
  const [startDate, setStartDate]   = useState('')
  const [endDate, setEndDate]       = useState('')
  const [selected, setSelected]     = useState(new Set())
  const [loading, setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [alert, setAlert]           = useState({ type: '', message: '' })
  const [confirm, setConfirm]       = useState(null)
  const [participants, setParticipants] = useState([])
  const [editRecord, setEditRecord] = useState(null)   // record sedang diedit
  const [showAdd, setShowAdd]       = useState(false)

  // Load daftar peserta sekali saat mount (untuk dropdown modal)
  useEffect(() => {
    getParticipants().then(setParticipants).catch(() => {})
  }, [])

  const fetchPage = useCallback(
    async (pageOffset) => {
      setLoading(true)
      setAlert({ type: '', message: '' })
      try {
        const data = await getAttendance({
          limit: PAGE_SIZE,
          offset: pageOffset,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        })
        setItems(data.items || [])
        setTotal(data.total || 0)
        setSelected(new Set())
      } catch (err) {
        setAlert({ type: 'error', message: err.message })
        setItems([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [startDate, endDate],
  )

  useEffect(() => { fetchPage(offset) }, [offset, fetchPage])

  function applyFilter(e) {
    e.preventDefault()
    if (offset === 0) fetchPage(0)
    else setOffset(0)
  }

  function resetFilter() {
    setStartDate('')
    setEndDate('')
    setOffset(0)
  }

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(
      selected.size === items.length
        ? new Set()
        : new Set(items.map((r) => r.id)),
    )
  }

  // ── Handler hapus ───────────────────────────────────────────────────────────
  async function handleDeleteSelected() {
    setActionLoading(true)
    try {
      await Promise.all([...selected].map((id) => deleteAttendance(id)))
      setAlert({ type: 'success', message: `${selected.size} log berhasil dihapus.` })
      setConfirm(null)
      if (offset > 0 && items.length === selected.size)
        setOffset(Math.max(0, offset - PAGE_SIZE))
      else fetchPage(offset)
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDeleteAll() {
    setActionLoading(true)
    try {
      await deleteAllAttendance()
      setAlert({ type: 'success', message: 'Semua log absensi berhasil dihapus.' })
      setConfirm(null)
      setOffset(0)
      fetchPage(0)
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  // ── Handler edit ────────────────────────────────────────────────────────────
  async function handleSaveEdit(id, payload) {
    const updated = await updateAttendance(id, payload)
    setItems((prev) => prev.map((r) => (r.id === id ? updated : r)))
    setEditRecord(null)
    setAlert({ type: 'success', message: `Absensi #${id} berhasil diperbarui.` })
  }

  // ── Handler tambah ──────────────────────────────────────────────────────────
  async function handleSaveAdd(payload) {
    await createAttendance(payload)
    setShowAdd(false)
    setAlert({ type: 'success', message: 'Absensi berhasil ditambahkan.' })
    // Refresh ke halaman pertama agar record baru kelihatan
    if (offset === 0) fetchPage(0)
    else setOffset(0)
  }

  return (
    <div className="page-grid single wide">
      <section className="panel">
        <div className="panel-header">
          <h2>Riwayat Absensi</h2>
          <span className="meta-badge">{total} record</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowAdd(true)}
          >
            + Tambah Manual
          </button>
        </div>

        <form className="filter-form" onSubmit={applyFilter}>
          <label>
            Dari tanggal
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            Sampai tanggal
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">Filter</button>
          <button type="button" className="btn btn-ghost" onClick={resetFilter}>Reset</button>
        </form>

        <AlertMessage
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert({ type: '', message: '' })}
        />

        <div className="toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={selected.size === 0 || actionLoading}
            onClick={() =>
              setConfirm({
                title: 'Hapus Log Terpilih',
                message: `Hapus ${selected.size} log absensi yang dipilih?`,
                danger: true,
                onConfirm: handleDeleteSelected,
              })
            }
          >
            Hapus Terpilih ({selected.size})
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={total === 0 || actionLoading}
            onClick={() =>
              setConfirm({
                title: 'Hapus Semua Log',
                message: 'Hapus SEMUA log absensi? Tindakan ini tidak dapat dibatalkan.',
                danger: true,
                onConfirm: handleDeleteAll,
              })
            }
          >
            Hapus Semua
          </button>
        </div>

        {loading ? (
          <LoadingSpinner label="Memuat riwayat absensi..." />
        ) : items.length === 0 ? (
          <p className="empty-state">Tidak ada data absensi untuk filter ini.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selected.size === items.length}
                      onChange={toggleSelectAll}
                      aria-label="Pilih semua"
                    />
                  </th>
                  <th>ID</th>
                  <th>No.</th>
                  <th>Nama</th>
                  <th>Waktu</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className={selected.has(row.id) ? 'selected-row' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Pilih log ${row.id}`}
                      />
                    </td>
                    <td>{row.id}</td>
                    <td>{row.nomor_absen}</td>
                    <td>{row.nama}</td>
                    <td>{row.waktu}</td>
                    <td><span className="badge">{row.status}</span></td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditRecord(row)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > PAGE_SIZE && (
          <div className="pagination">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              ← Sebelumnya
            </button>
            <span>Halaman {currentPage} / {totalPages}</span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Selanjutnya →
            </button>
          </div>
        )}
      </section>

      {/* Modal edit */}
      {editRecord && (
        <EditModal
          record={editRecord}
          participants={participants}
          onSave={handleSaveEdit}
          onClose={() => setEditRecord(null)}
        />
      )}

      {/* Modal tambah */}
      {showAdd && (
        <AddModal
          participants={participants}
          onSave={handleSaveAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        loading={actionLoading}
        onConfirm={confirm?.onConfirm}
        onCancel={() => !actionLoading && setConfirm(null)}
      />
    </div>
  )
}
