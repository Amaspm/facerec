import { useCallback, useEffect, useRef, useState } from 'react'
import CameraCapture from '../components/CameraCapture'
import { getAttendance, recognizeFace } from '../api/client'

const RECOGNIZE_INTERVAL_MS = 800

function getFaceColor(face) {
  if (!face.recognized) return '#ef4444'
  if (face.attendance_recorded) return '#22c55e'
  if (face.already_attended_today) return '#f97316'
  return '#22c55e'
}

function getFaceLabel(face) {
  if (!face.recognized) return 'Tidak Dikenal'
  const name = face.nomor_absen && face.nama ? `${face.nomor_absen} - ${face.nama}` : face.key
  if (face.already_attended_today && !face.attendance_recorded) {
    return `${name} (Sudah Absen)`
  }
  if (face.attendance_recorded) {
    return `${name} ✓`
  }
  return name
}

export default function AttendancePage() {
  const cameraRef = useRef(null)
  const overlayRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [faces, setFaces] = useState([])
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState('Kamera mati')
  const [processing, setProcessing] = useState(false)
  const processingRef = useRef(false)

  const loadHistory = useCallback(async () => {
    try {
      const data = await getAttendance({ limit: 15 })
      setHistory(data.items || [])
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (!cameraActive) return undefined

    const intervalId = setInterval(async () => {
      if (processingRef.current || !cameraRef.current?.isReady()) return

      const blob = await cameraRef.current.captureFrame()
      if (!blob) return

      processingRef.current = true
      setProcessing(true)
      try {
        const result = await recognizeFace(blob, true)
        setFaces(result.faces || [])
        if (result.faces_detected === 0) {
          setStatus('Menunggu wajah...')
        } else {
          const recorded = result.faces.some((f) => f.attendance_recorded)
          setStatus(recorded ? 'Absensi berhasil dicatat!' : 'Wajah terdeteksi')
          if (recorded) loadHistory()
        }
      } catch (err) {
        setStatus(`Error: ${err.message}`)
      } finally {
        processingRef.current = false
        setProcessing(false)
      }
    }, RECOGNIZE_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [cameraActive, loadHistory])

  useEffect(() => {
    const overlay = overlayRef.current
    const video = cameraRef.current?.getVideoElement?.()
    if (!overlay || !video || !cameraActive) return

    const draw = () => {
      overlay.width = video.clientWidth
      overlay.height = video.clientHeight
      const ctx = overlay.getContext('2d')
      ctx.clearRect(0, 0, overlay.width, overlay.height)

      if (!faces.length || !video.videoWidth) {
        requestAnimationFrame(draw)
        return
      }

      const scaleX = overlay.width / video.videoWidth
      const scaleY = overlay.height / video.videoHeight

      faces.forEach((face) => {
        const { top, right, bottom, left } = face.bbox
        const x = overlay.width - right * scaleX
        const y = top * scaleY
        const w = (right - left) * scaleX
        const h = (bottom - top) * scaleY

        ctx.strokeStyle = getFaceColor(face)
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, w, h)

        const label = getFaceLabel(face)
        ctx.font = '12px sans-serif'
        const textWidth = ctx.measureText(label).width
        ctx.fillStyle = getFaceColor(face)
        ctx.fillRect(x, y - 18, textWidth + 8, 18)
        ctx.fillStyle = '#fff'
        ctx.fillText(label, x + 4, y - 5)
      })

      requestAnimationFrame(draw)
    }

    const animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [faces, cameraActive])

  return (
    <div className="page-grid">
      <section className="panel camera-panel">
        <div className="panel-header">
          <h2>Mode Absensi</h2>
          <span className={`status-pill ${processing ? 'busy' : ''}`}>{status}</span>
        </div>

        <div className="camera-stage">
          <CameraCapture ref={cameraRef} active={cameraActive} />
          <canvas ref={overlayRef} className="camera-overlay" />
        </div>

        <div className="action-row">
          {!cameraActive ? (
            <button type="button" className="btn btn-primary" onClick={() => setCameraActive(true)}>
              Mulai Kamera
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setCameraActive(false)
                setFaces([])
                setStatus('Kamera mati')
              }}
            >
              Stop Kamera
            </button>
          )}
        </div>

        <ul className="legend">
          <li><span className="dot green" /> Dikenali / Absen berhasil</li>
          <li><span className="dot orange" /> Sudah absen hari ini</li>
          <li><span className="dot red" /> Tidak dikenal</li>
        </ul>
      </section>

      <section className="panel history-panel">
        <div className="panel-header">
          <h2>Riwayat Terbaru</h2>
          <button type="button" className="btn btn-ghost" onClick={loadHistory}>
            Refresh
          </button>
        </div>
        {history.length === 0 ? (
          <p className="empty-state">Belum ada absensi tercatat.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Nama</th>
                <th>Waktu</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.nomor_absen}</td>
                  <td>{row.nama}</td>
                  <td>{row.waktu}</td>
                  <td><span className="badge">{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
