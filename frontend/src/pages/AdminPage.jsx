import { useCallback, useEffect, useRef, useState } from 'react'
import CameraCapture from '../components/CameraCapture'
import FaceDetectOverlay from '../components/FaceDetectOverlay'
import ConfirmDialog from '../components/ConfirmDialog'
import AlertMessage from '../components/AlertMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  deleteParticipant,
  getParticipantFaceImageUrl,
  getParticipants,
  patchParticipant,
  registerFace,
  resetFaceSamples,
} from '../api/client'

// ── Sub-komponen: kartu peserta ───────────────────────────────────────────────

function ParticipantCard({ participant, onUpdated, onDeleted, setGlobalAlert }) {
  const [mode, setMode]               = useState('view')   // view | edit | register
  const [editNomor, setEditNomor]     = useState(participant.nomor_absen)
  const [editNama, setEditNama]       = useState(participant.nama)
  const [cameraActive, setCameraActive] = useState(false)
  const [faceCount, setFaceCount]     = useState(0)
  const [sampleCount, setSampleCount] = useState(participant.sample_count)
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [imgTs, setImgTs]             = useState(Date.now()) // cache-bust
  const cameraRef  = useRef(null)

  const videoElRef = {
    get current() {
      return cameraRef.current?.getVideoElement?.() ?? null
    },
  }

  function cancelEdit() {
    setEditNomor(participant.nomor_absen)
    setEditNama(participant.nama)
    setMode('view')
  }

  async function saveEdit() {
    const newNomor = editNomor.trim()
    const newNama  = editNama.trim()
    if (!newNomor || !newNama) {
      setGlobalAlert({ type: 'error', message: 'Nomor absen dan nama tidak boleh kosong.' })
      return
    }
    setSaving(true)
    try {
      const updated = await patchParticipant(participant.nomor_absen, {
        nomor_absen: newNomor !== participant.nomor_absen ? newNomor : undefined,
        nama: newNama !== participant.nama ? newNama : undefined,
      })
      setGlobalAlert({ type: 'success', message: `Data ${updated.nama} berhasil diperbarui.` })
      setMode('view')
      onUpdated(updated)
    } catch (err) {
      setGlobalAlert({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteParticipant(participant.nomor_absen)
      setGlobalAlert({ type: 'success', message: `Peserta ${participant.nama} berhasil dihapus.` })
      onDeleted(participant.nomor_absen)
    } catch (err) {
      setGlobalAlert({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  async function startRegister() {
    // Hapus sampel lama, lalu aktifkan kamera
    setSaving(true)
    try {
      await resetFaceSamples(participant.nomor_absen)
      setSampleCount(0)
      setMode('register')
      setCameraActive(true)
    } catch (err) {
      setGlobalAlert({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function captureRegister() {
    if (!cameraRef.current?.isReady()) return
    setSaving(true)
    try {
      const blob   = await cameraRef.current.captureFrame()
      const result = await registerFace(blob, participant.nomor_absen, participant.nama)
      if (result.success) {
        setSampleCount(result.sample_count)
        setImgTs(Date.now())  // refresh foto
        setGlobalAlert({
          type: 'success',
          message: `Sampel ${result.sample_count} berhasil disimpan untuk ${participant.nama}.`,
        })
      } else {
        setGlobalAlert({ type: 'error', message: result.message })
      }
    } catch (err) {
      setGlobalAlert({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  function stopRegister() {
    setCameraActive(false)
    setMode('view')
    onUpdated({ ...participant, sample_count: sampleCount })
  }

  const faceImgUrl = `${getParticipantFaceImageUrl(participant.nomor_absen)}?t=${imgTs}`

  return (
    <div className={`admin-card ${mode !== 'view' ? 'admin-card--active' : ''}`}>
      {/* Foto wajah */}
      <div className="admin-face-photo">
        {sampleCount > 0 ? (
          <img
            src={faceImgUrl}
            alt={`Wajah ${participant.nama}`}
            className="face-img"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="face-img-placeholder">
            <span>Belum<br/>terdaftar</span>
          </div>
        )}
      </div>

      {/* Info / form edit */}
      <div className="admin-card-body">
        {mode === 'view' && (
          <>
            <div className="admin-card-info">
              <span className="admin-nomor">{participant.nomor_absen}</span>
              <span className="admin-nama">{participant.nama}</span>
            </div>
            <span className={`sample-badge ${sampleCount >= 3 ? 'ok' : 'low'}`}>
              {sampleCount} sampel
            </span>
            <div className="admin-card-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setMode('edit')}>
                Edit Info
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={startRegister}
                disabled={saving}
                title="Hapus sampel lama lalu daftar ulang foto"
              >
                {saving ? '...' : 'Daftar Ulang Foto'}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                Hapus
              </button>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <div className="admin-edit-form">
            <label>
              No. Absen
              <input
                type="text"
                value={editNomor}
                onChange={(e) => setEditNomor(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Nama
              <input
                type="text"
                value={editNama}
                onChange={(e) => setEditNama(e.target.value)}
              />
            </label>
            <div className="admin-card-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={cancelEdit}
                disabled={saving}
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {mode === 'register' && (
          <div className="admin-register-mode">
            <p className="hint">
              Klik &quot;Ambil Sampel&quot; beberapa kali dari sudut berbeda.
              Sampel: <strong>{sampleCount}</strong>
            </p>
            <div className="camera-stage compact" style={{ maxWidth: 280 }}>
              <CameraCapture ref={cameraRef} active={cameraActive} />
              <FaceDetectOverlay
                videoRef={videoElRef}
                active={cameraActive}
                onFaceCountChange={setFaceCount}
              />
              {cameraActive && (
                <div className="face-status-bar">
                  <span className={`face-dot ${faceCount > 0 ? 'detected' : ''}`} />
                  {faceCount === 0 ? 'Arahkan wajah...' : 'Wajah terdeteksi'}
                </div>
              )}
            </div>
            <div className="admin-card-actions" style={{ marginTop: '0.5rem' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={captureRegister}
                disabled={saving || faceCount === 0}
              >
                {saving ? 'Menyimpan...' : 'Ambil Sampel'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={stopRegister}>
                Selesai
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Hapus Peserta"
        message={`Hapus peserta "${participant.nama}" (${participant.nomor_absen}) beserta data wajahnya?`}
        danger
        loading={saving}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onCancel={() => !saving && setConfirmDelete(false)}
      />
    </div>
  )
}

// ── Halaman utama Admin ───────────────────────────────────────────────────────

export default function AdminPage() {
  const [participants, setParticipants] = useState([])
  const [loading, setLoading]           = useState(true)
  const [alert, setAlert]               = useState({ type: '', message: '' })
  const [search, setSearch]             = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getParticipants()
      setParticipants(data)
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function handleUpdated(updated) {
    setParticipants((prev) =>
      prev.map((p) =>
        p.nomor_absen === updated.nomor_absen ? { ...p, ...updated } : p,
      ),
    )
    // Reload penuh jika nomor absen berubah (key berubah)
    loadData()
  }

  function handleDeleted(nomorAbsen) {
    setParticipants((prev) => prev.filter((p) => p.nomor_absen !== nomorAbsen))
  }

  const filtered = participants.filter(
    (p) =>
      p.nama.toLowerCase().includes(search.toLowerCase()) ||
      p.nomor_absen.includes(search),
  )

  return (
    <div className="page-grid single wide">
      <section className="panel">
        <div className="panel-header">
          <h2>Manajemen Peserta</h2>
          <span className="meta-badge">{participants.length} peserta</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={loadData}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <p className="panel-desc">
          Kelola data peserta: lihat foto wajah, edit nomor absen &amp; nama,
          atau daftar ulang foto tanpa menghapus riwayat absensi.
        </p>

        <div className="admin-search">
          <input
            type="search"
            placeholder="Cari nama atau nomor absen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <AlertMessage
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert({ type: '', message: '' })}
        />

        {loading ? (
          <LoadingSpinner label="Memuat data peserta..." />
        ) : filtered.length === 0 ? (
          <p className="empty-state">
            {search ? 'Tidak ada peserta yang cocok.' : 'Belum ada peserta terdaftar.'}
          </p>
        ) : (
          <div className="admin-grid">
            {filtered.map((p) => (
              <ParticipantCard
                key={p.nomor_absen}
                participant={p}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
                setGlobalAlert={setAlert}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
