import { useRef, useState } from 'react'
import CameraCapture from '../components/CameraCapture'
import FaceDetectOverlay from '../components/FaceDetectOverlay'
import { detectFaces, registerFace } from '../api/client'

// ─────────────────────────────────────────────────────────────────────────────
// Panel form nomor + nama — dipakai di kedua mode
// ─────────────────────────────────────────────────────────────────────────────
function IdentityForm({ nomorAbsen, nama, onNomor, onNama }) {
  return (
    <div className="register-form">
      <label>
        No. Absen
        <input
          type="text"
          value={nomorAbsen}
          onChange={(e) => onNomor(e.target.value)}
          placeholder="Contoh: 01"
        />
      </label>
      <label>
        Nama
        <input
          type="text"
          value={nama}
          onChange={(e) => onNama(e.target.value)}
          placeholder="Nama lengkap"
        />
      </label>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode kamera
// ─────────────────────────────────────────────────────────────────────────────
function CameraMode({ nomorAbsen, nama }) {
  const cameraRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [faceCount, setFaceCount]       = useState(0)
  const [message, setMessage]           = useState('')
  const [messageType, setMessageType]   = useState('')
  const [loading, setLoading]           = useState(false)
  const [sampleCount, setSampleCount]   = useState(0)

  const videoElRef = {
    get current() { return cameraRef.current?.getVideoElement?.() ?? null },
  }

  async function handleRegister() {
    const nomor = nomorAbsen.trim()
    const name  = nama.trim()
    if (!nomor || !name) {
      setMessageType('error')
      setMessage('Masukkan nomor absen dan nama terlebih dahulu.')
      return
    }
    if (!cameraActive || !cameraRef.current?.isReady()) {
      setMessageType('error')
      setMessage('Nyalakan kamera terlebih dahulu.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const blob   = await cameraRef.current.captureFrame()
      if (!blob) throw new Error('Gagal mengambil frame dari kamera')
      const result = await registerFace(blob, nomor, name)
      if (result.success) {
        setMessageType('success')
        setMessage(`${result.message} (Sampel: ${result.sample_count})`)
        setSampleCount(result.sample_count)
      } else {
        setMessageType('error')
        setMessage(result.message)
      }
    } catch (err) {
      setMessageType('error')
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="camera-stage compact">
        <CameraCapture ref={cameraRef} active={cameraActive} />
        <FaceDetectOverlay
          videoRef={videoElRef}
          active={cameraActive}
          onFaceCountChange={setFaceCount}
        />
        {cameraActive && (
          <div className="face-status-bar">
            <span className={`face-dot ${faceCount > 0 ? 'detected' : ''}`} />
            {faceCount === 0
              ? 'Arahkan wajah ke kamera...'
              : faceCount === 1
                ? 'Wajah terdeteksi — siap ambil sampel'
                : `${faceCount} wajah terdeteksi`}
          </div>
        )}
      </div>

      <div className="action-row">
        {!cameraActive ? (
          <button type="button" className="btn btn-primary" onClick={() => setCameraActive(true)}>
            Mulai Kamera
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setCameraActive(false)}>
            Stop Kamera
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleRegister}
          disabled={loading || !cameraActive}
        >
          {loading ? 'Memproses...' : 'Daftar Wajah'}
        </button>
      </div>

      {message && <div className={`alert ${messageType}`}>{message}</div>}
      {sampleCount > 0 && (
        <p className="hint">
          Sampel terkumpul sesi ini: <strong>{sampleCount}</strong>.
          Ulangi klik &quot;Daftar Wajah&quot; untuk menambah sampel.
        </p>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode upload gambar
// ─────────────────────────────────────────────────────────────────────────────
function UploadMode({ nomorAbsen, nama }) {
  const inputRef = useRef(null)

  // Tahap: idle → previewing → detecting → result (success/error)
  const [stage, setStage]         = useState('idle')   // idle | previewing | detecting | done
  const [previewUrl, setPreviewUrl] = useState(null)
  const [file, setFile]           = useState(null)
  const [faceResult, setFaceResult] = useState(null)  // hasil deteksi sebelum daftar
  const [message, setMessage]     = useState('')
  const [messageType, setMessageType] = useState('')
  const [sampleCount, setSampleCount] = useState(0)
  const [loading, setLoading]     = useState(false)

  function reset() {
    setStage('idle')
    setPreviewUrl(null)
    setFile(null)
    setFaceResult(null)
    setMessage('')
    setSampleCount(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Langkah 1: user pilih file → tampilkan preview → deteksi otomatis
  async function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return

    // Validasi tipe
    if (!f.type.startsWith('image/')) {
      setMessageType('error')
      setMessage('File harus berupa gambar (JPG, PNG, dll).')
      return
    }

    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setStage('detecting')
    setMessage('')
    setFaceResult(null)

    // Deteksi wajah di gambar — pakai endpoint /api/faces/detect
    try {
      const result = await detectFaces(f)
      setFaceResult(result)
      if (result.faces_detected === 0) {
        setStage('previewing')
        setMessageType('error')
        setMessage('Wajah tidak terdeteksi pada gambar ini. Pilih foto yang lebih jelas.')
      } else if (result.faces_detected > 1) {
        setStage('previewing')
        setMessageType('error')
        setMessage(`Terdeteksi ${result.faces_detected} wajah. Gunakan foto yang hanya menampilkan 1 wajah.`)
      } else {
        // Tepat 1 wajah — siap daftar
        setStage('previewing')
        setMessageType('success')
        setMessage('1 wajah terdeteksi. Klik "Daftar Wajah" untuk menyimpan.')
      }
    } catch (err) {
      setStage('previewing')
      setMessageType('error')
      setMessage(`Gagal mendeteksi: ${err.message}`)
    }
  }

  // Langkah 2: user klik Daftar Wajah → register
  async function handleRegister() {
    const nomor = nomorAbsen.trim()
    const name  = nama.trim()
    if (!nomor || !name) {
      setMessageType('error')
      setMessage('Masukkan nomor absen dan nama terlebih dahulu.')
      return
    }
    if (!file) {
      setMessageType('error')
      setMessage('Pilih file gambar terlebih dahulu.')
      return
    }
    if (!faceResult || faceResult.faces_detected !== 1) {
      setMessageType('error')
      setMessage('Gambar harus menampilkan tepat 1 wajah yang terdeteksi.')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const result = await registerFace(file, nomor, name)
      if (result.success) {
        setMessageType('success')
        setMessage(`Registrasi berhasil! Sampel tersimpan: ${result.sample_count}`)
        setSampleCount(result.sample_count)
        setStage('done')
      } else {
        setMessageType('error')
        setMessage(result.message)
      }
    } catch (err) {
      setMessageType('error')
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  const faceDetected = faceResult?.faces_detected === 1
  const canRegister  = faceDetected && stage === 'previewing' && !loading

  return (
    <>
      {/* Drop zone / tombol pilih file */}
      <div
        className={`upload-dropzone ${stage !== 'idle' ? 'has-file' : ''}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Pilih gambar untuk registrasi wajah"
      >
        {previewUrl ? (
          <div className="upload-preview-wrap">
            <img src={previewUrl} alt="Preview foto" className="upload-preview-img" />
            {/* Overlay status deteksi */}
            {stage === 'detecting' && (
              <div className="upload-overlay-status detecting">
                <span className="spinner-inline" />
                Mendeteksi wajah...
              </div>
            )}
            {stage !== 'detecting' && faceResult && (
              <div className={`upload-overlay-status ${faceDetected ? 'ok' : 'fail'}`}>
                {faceDetected ? '✓ Wajah terdeteksi' : '✗ Wajah tidak terdeteksi'}
              </div>
            )}
          </div>
        ) : (
          <div className="upload-placeholder">
            <span className="upload-icon">📷</span>
            <p>Klik untuk pilih foto</p>
            <p className="upload-hint">JPG, PNG — foto tampak depan, 1 wajah</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="upload-input-hidden"
          onChange={handleFileChange}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {message && <div className={`alert ${messageType}`}>{message}</div>}

      <div className="action-row">
        {stage !== 'idle' && (
          <button type="button" className="btn btn-ghost" onClick={reset} disabled={loading}>
            Ganti Foto
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleRegister}
          disabled={!canRegister}
        >
          {loading ? 'Mendaftarkan...' : 'Daftar Wajah'}
        </button>
      </div>

      {sampleCount > 0 && (
        <p className="hint">
          Sampel terkumpul: <strong>{sampleCount}</strong>.
          Upload foto lagi untuk menambah sampel.
        </p>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Halaman utama — tab Kamera / Upload
// ─────────────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const [mode, setMode]         = useState('camera')  // 'camera' | 'upload'
  const [nomorAbsen, setNomor]  = useState('')
  const [nama, setNama]         = useState('')

  return (
    <div className="page-grid single">
      <section className="panel">
        <div className="panel-header">
          <h2>Registrasi Wajah</h2>
        </div>

        <p className="panel-desc">
          Daftarkan wajah peserta. Gunakan kamera langsung atau upload foto dari perangkat.
          Dianjurkan 3–5 sampel dari sudut berbeda untuk akurasi lebih baik.
        </p>

        {/* Tab mode */}
        <div className="register-tabs">
          <button
            type="button"
            className={`register-tab ${mode === 'camera' ? 'active' : ''}`}
            onClick={() => setMode('camera')}
          >
            📸 Kamera
          </button>
          <button
            type="button"
            className={`register-tab ${mode === 'upload' ? 'active' : ''}`}
            onClick={() => setMode('upload')}
          >
            📁 Upload Foto
          </button>
        </div>

        {/* Form identitas — sama untuk kedua mode */}
        <IdentityForm
          nomorAbsen={nomorAbsen}
          nama={nama}
          onNomor={setNomor}
          onNama={setNama}
        />

        {/* Konten per mode */}
        {mode === 'camera'
          ? <CameraMode nomorAbsen={nomorAbsen} nama={nama} />
          : <UploadMode nomorAbsen={nomorAbsen} nama={nama} />
        }
      </section>
    </div>
  )
}
