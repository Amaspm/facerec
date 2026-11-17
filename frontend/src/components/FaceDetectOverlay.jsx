import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { detectFaces } from '../api/client'

const DETECT_INTERVAL_MS = 700
const BOX_COLOR_DETECTED = '#22c55e'   // hijau — wajah terdeteksi
const BOX_COLOR_UNKNOWN  = '#f59e0b'   // kuning — terdeteksi tapi tidak dikenal

/**
 * Overlay canvas di atas <video> untuk menampilkan bounding box wajah.
 *
 * Props:
 *   videoRef  — ref ke <video> element (dari CameraCapture.getVideoElement())
 *   active    — boolean, mulai/hentikan loop deteksi
 *   mirrored  — boolean, apakah video di-mirror (default true)
 *
 * Expose via ref:
 *   faceCount — jumlah wajah terakhir terdeteksi
 */
const FaceDetectOverlay = forwardRef(function FaceDetectOverlay(
  { videoRef, active, mirrored = true, onFaceCountChange },
  ref,
) {
  const canvasRef  = useRef(null)
  const captureRef = useRef(null)   // hidden canvas untuk capture frame
  const timerRef   = useRef(null)
  const runningRef = useRef(false)
  const [faceCount, setFaceCount] = useState(0)

  useImperativeHandle(ref, () => ({ faceCount }))

  useEffect(() => {
    if (!active) {
      runningRef.current = false
      clearTimeout(timerRef.current)
      // Bersihkan canvas saat kamera mati
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      setFaceCount(0)
      if (onFaceCountChange) onFaceCountChange(0)
      return
    }

    runningRef.current = true

    async function detectLoop() {
      if (!runningRef.current) return

      const video   = videoRef?.current
      const overlay = canvasRef.current
      const cap     = captureRef.current

      if (!video || !overlay || !cap || video.readyState < 2 || video.videoWidth === 0) {
        timerRef.current = setTimeout(detectLoop, DETECT_INTERVAL_MS)
        return
      }

      // Sinkronkan ukuran overlay dengan video
      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width  = video.videoWidth
        overlay.height = video.videoHeight
        cap.width      = video.videoWidth
        cap.height     = video.videoHeight
      }

      // Capture frame ke hidden canvas (un-mirrored — backend butuh gambar normal)
      const capCtx = cap.getContext('2d')
      capCtx.drawImage(video, 0, 0, cap.width, cap.height)

      let faces = []
      try {
        const blob = await new Promise((res) =>
          cap.toBlob(res, 'image/jpeg', 0.75),
        )
        if (blob) {
          const result = await detectFaces(blob)
          faces = result.faces || []
        }
      } catch {
        // Abaikan error jaringan — lanjutkan loop
      }

      // Gambar overlay
      const ctx = overlay.getContext('2d')
      ctx.clearRect(0, 0, overlay.width, overlay.height)

      const W = overlay.width

      for (const face of faces) {
        const { top, right, bottom, left } = face.bbox
        let x      = left
        const y    = top
        const w    = right - left
        const h    = bottom - top

        // Mirror koordinat X jika video di-mirror
        if (mirrored) x = W - right

        const color = face.recognized ? BOX_COLOR_DETECTED : BOX_COLOR_UNKNOWN
        ctx.strokeStyle = color
        ctx.lineWidth   = 2.5
        ctx.strokeRect(x, y, w, h)

        // Label di atas kotak
        const label = face.recognized
          ? `${face.nama} (${face.nomor_absen})`
          : 'Wajah terdeteksi'
        ctx.font         = 'bold 13px sans-serif'
        ctx.fillStyle    = color
        const textY      = y > 18 ? y - 5 : y + h + 15
        ctx.fillText(label, x, textY)
      }

      setFaceCount(faces.length)
      if (onFaceCountChange) onFaceCountChange(faces.length)

      if (runningRef.current) {
        timerRef.current = setTimeout(detectLoop, DETECT_INTERVAL_MS)
      }
    }

    // Mulai setelah sedikit delay agar kamera sempat warm-up
    timerRef.current = setTimeout(detectLoop, 500)

    return () => {
      runningRef.current = false
      clearTimeout(timerRef.current)
    }
  }, [active, videoRef, mirrored])

  return (
    <>
      {/* Hidden canvas untuk capture */}
      <canvas ref={captureRef} style={{ display: 'none' }} />
      {/* Overlay canvas — posisi absolute di atas video */}
      <canvas
        ref={canvasRef}
        className="face-overlay-canvas"
        aria-hidden="true"
      />
    </>
  )
})

export default FaceDetectOverlay
