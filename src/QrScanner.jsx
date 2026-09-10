import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

function QrScanner({ onClose, onScan }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const onScanRef = useRef(onScan)
  const [message, setMessage] = useState('Starting camera…')

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    let active = true
    let animationFrame
    let stream

    const stopCamera = () => {
      active = false
      cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
    }

    const scanFrame = () => {
      if (!active) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video?.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const image = context.getImageData(0, 0, canvas.width, canvas.height)
        const result = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        })
        if (result) {
          if (onScanRef.current(result.data)) {
            stopCamera()
            return
          }
          setMessage('This is not a valid session QR code. Try another code.')
        }
      }
      animationFrame = requestAnimationFrame(scanFrame)
    }

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        })
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setMessage('Point the camera at a session QR code')
        animationFrame = requestAnimationFrame(scanFrame)
      } catch {
        setMessage('Camera unavailable. Allow camera access and use HTTPS, then try again.')
      }
    }

    startCamera()
    return stopCamera
  }, [])

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Scan QR code">
      <div className="scanner-card">
        <h2>Scan QR Code</h2>
        <div className="scanner-viewport">
          <video ref={videoRef} playsInline muted />
          <div className="scanner-guide" aria-hidden="true" />
        </div>
        <canvas ref={canvasRef} hidden />
        <p className="scanner-message">{message}</p>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export default QrScanner
