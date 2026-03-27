import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { supabase } from '../lib/supabase'

export default function ClientScanPage() {
  const videoRef    = useRef(null)
  const readerRef   = useRef(null)
  const navigate    = useNavigate()
  const [status, setStatus]   = useState('idle')   // idle | scanning | found | error
  const [error, setError]     = useState('')
  const [user, setUser]       = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  async function startScan() {
    setStatus('scanning')
    setError('')
    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          const code = result.getText()
          stopScan()
          // Vibrate on success if supported
          if (navigator.vibrate) navigator.vibrate(100)
          navigate(`/client/door/${encodeURIComponent(code)}`)
        }
        if (err && !(err instanceof NotFoundException)) {
          console.warn(err)
        }
      })
    } catch (e) {
      setError('Could not access camera. Please allow camera permission and try again.')
      setStatus('error')
    }
  }

  function stopScan() {
    if (readerRef.current) {
      BrowserMultiFormatReader.releaseAllStreams()
      readerRef.current = null
    }
    setStatus('idle')
  }

  async function signOut() {
    stopScan()
    await supabase.auth.signOut()
    navigate('/client/login')
  }

  const isScanning = status === 'scanning'

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <img src="/NEW - TF Jones - Enhancing Building Safety Logo Transparent - White.png"
          alt="TF Jones" style={s.logo} />
        <button style={s.signOut} onClick={signOut}>Sign Out</button>
      </div>

      <div style={s.body}>
        <h1 style={s.title}>Scan Door Barcode</h1>
        <p style={s.sub}>Point your camera at the barcode sticker on the fire door</p>

        {/* Camera viewfinder */}
        <div style={{ ...s.viewfinder, display: isScanning ? 'flex' : 'none' }}>
          <video ref={videoRef} style={s.video} autoPlay muted playsInline />
          {/* Scan guide overlay */}
          <div style={s.overlay}>
            <div style={s.scanWindow}>
              <div style={{ ...s.corner, top: 0, left: 0, borderTop: '3px solid #EEFF00', borderLeft: '3px solid #EEFF00' }} />
              <div style={{ ...s.corner, top: 0, right: 0, borderTop: '3px solid #EEFF00', borderRight: '3px solid #EEFF00' }} />
              <div style={{ ...s.corner, bottom: 0, left: 0, borderBottom: '3px solid #EEFF00', borderLeft: '3px solid #EEFF00' }} />
              <div style={{ ...s.corner, bottom: 0, right: 0, borderBottom: '3px solid #EEFF00', borderRight: '3px solid #EEFF00' }} />
              <div style={s.scanLine} />
            </div>
            <p style={s.scanHint}>Align barcode within the frame</p>
          </div>
        </div>

        {/* Idle state */}
        {!isScanning && (
          <div style={s.idleBox}>
            <div style={s.barcodeIcon}>
              <BarcodeIcon />
            </div>
            <p style={s.idleText}>Ready to scan</p>
          </div>
        )}

        {error && <p style={s.error}>{error}</p>}

        {/* Action button */}
        {!isScanning ? (
          <button style={s.scanBtn} onClick={startScan}>
            📷  Start Scanning
          </button>
        ) : (
          <button style={{ ...s.scanBtn, background: '#1A3A5C' }} onClick={stopScan}>
            ✕  Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function BarcodeIcon() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {[0,6,10,14,20,24,30,34,38,44,48,54,58,62,68,72].map((x, i) => (
        <rect key={i} x={x} y={8} width={i % 3 === 0 ? 3 : 2} height={44} fill="#8A9BAD" rx={1} />
      ))}
    </svg>
  )
}

const s = {
  page:       { minHeight: '100vh', background: '#0D1F35', display: 'flex', flexDirection: 'column' },
  header:     { background: '#162840', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1A3A5C' },
  logo:       { height: 32, objectFit: 'contain' },
  signOut:    { background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: 13 },
  body:       { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px', gap: 20 },
  title:      { color: '#fff', fontSize: 24, fontWeight: 700, margin: 0, textAlign: 'center' },
  sub:        { color: '#8A9BAD', fontSize: 14, textAlign: 'center', margin: 0, maxWidth: 300 },
  viewfinder: { width: '100%', maxWidth: 380, aspectRatio: '4/3', borderRadius: 16, overflow: 'hidden', position: 'relative', background: '#000', justifyContent: 'center', alignItems: 'center' },
  video:      { width: '100%', height: '100%', objectFit: 'cover' },
  overlay:    { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'rgba(0,0,0,0.4)' },
  scanWindow: { width: '75%', height: 100, position: 'relative' },
  corner:     { position: 'absolute', width: 20, height: 20 },
  scanLine:   { position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#EEFF00', opacity: 0.8, boxShadow: '0 0 8px #EEFF00' },
  scanHint:   { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center' },
  idleBox:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32, background: '#162840', borderRadius: 16, width: '100%', maxWidth: 380 },
  idleText:   { color: '#8A9BAD', fontSize: 15, margin: 0 },
  barcodeIcon:{ opacity: 0.6 },
  error:      { color: '#F44336', fontSize: 14, textAlign: 'center', maxWidth: 320 },
  scanBtn:    { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 14, padding: '18px 48px', fontSize: 17, fontWeight: 700, width: '100%', maxWidth: 380 },
}
