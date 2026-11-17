import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

const CameraCapture = forwardRef(function CameraCapture(
  { active, mirrored = true, className = '' },
  ref
) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!active) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setReady(false)
      return
    }

    let cancelled = false

    async function startCamera() {
      setError('')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
      } catch (err) {
        setError(
          err.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Berikan akses kamera di browser.'
            : `Kamera tidak tersedia: ${err.message}`
        )
        setReady(false)
      }
    }

    startCamera()

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [active])

  useImperativeHandle(ref, () => ({
    isReady: () => ready,
    captureFrame: async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || !ready || video.videoWidth === 0) {
        return null
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (mirrored) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85)
      })
    },
    getVideoElement: () => videoRef.current,
  }))

  return (
    <div className={`camera-wrap ${className}`}>
      <video
        ref={videoRef}
        className={`camera-video ${mirrored ? 'mirrored' : ''}`}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden-canvas" />
      {error && <div className="camera-error">{error}</div>}
      {active && !error && !ready && (
        <div className="camera-loading">Membuka kamera...</div>
      )}
    </div>
  )
})

export default CameraCapture
