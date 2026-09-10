import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import QrScanner from './QrScanner'


const syncCodePattern = /^[A-HJ-NP-Z2-9]{8}$/

function getInitialSyncCode() {
  const sharedCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase()
  if (sharedCode && syncCodePattern.test(sharedCode)) return sharedCode
  const savedCode = localStorage.getItem('everywhere-notes-code')
  return savedCode && syncCodePattern.test(savedCode) ? savedCode : null
}

function codeFromQrValue(value) {
  const rawCode = value.trim().toUpperCase()
  if (syncCodePattern.test(rawCode)) return rawCode
  try {
    const code = new URL(value, window.location.origin).searchParams.get('code')?.toUpperCase()
    return code && syncCodePattern.test(code) ? code : null
  } catch {
    return null
  }
}

function App() {
  const [syncCode, setSyncCode] = useState(getInitialSyncCode)
  const [inputCode, setInputCode] = useState('')
  const [notes, setNotes] = useState(() => {
    const initialCode = getInitialSyncCode()
    return initialCode ? localStorage.getItem(`everywhere_notes_${initialCode}`) || '' : ''
  })
  const [showQR, setShowQR] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getInitialSyncCode()))
  const [error, setError] = useState('')
  const [syncStatus, setSyncStatus] = useState('Connecting…')
  const [clientId] = useState(() => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`)
  const saveTimerRef = useRef(null)
  const latestContentRef = useRef(notes)
  const dirtyRef = useRef(false)
  const pendingRemoteRef = useRef(null)

  useEffect(() => {
    if (!syncCode) return

    dirtyRef.current = false
    pendingRemoteRef.current = null
    localStorage.setItem('everywhere-notes-code', syncCode)
    const events = new EventSource(`/api/notes/${encodeURIComponent(syncCode)}/events`)

    events.onopen = () => setSyncStatus('Synced')
    events.onerror = () => setSyncStatus('Reconnecting…')
    events.onmessage = (event) => {
      const update = JSON.parse(event.data)
      if (update.clientId === clientId) return
      if (dirtyRef.current) {
        pendingRemoteRef.current = update
      } else {
        latestContentRef.current = update.content
        setNotes(update.content)
        localStorage.setItem(`everywhere_notes_${syncCode}`, update.content)
      }
    }

    return () => {
      events.close()
      clearTimeout(saveTimerRef.current)
    }
  }, [clientId, syncCode])

  const handleCreateSession = async () => {
    try {
      setError('')
      const response = await fetch('/api/sessions', { method: 'POST' })
      if (!response.ok) throw new Error('Could not create a session')
      const session = await response.json()
      latestContentRef.current = session.content
      setSyncCode(session.code)
      setNotes(session.content)
      setIsAuthenticated(true)
      localStorage.setItem('everywhere-notes-code', session.code)
    } catch {
      setError('Cannot reach the sync server. Please try again.')
    }
  }

  const joinSession = async (code) => {
    if (!syncCodePattern.test(code)) {
      setError('Sync code must be 8 characters')
      return
    }
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(code)}`)
      if (!response.ok) throw new Error('Could not join the session')
      const note = await response.json()
      latestContentRef.current = note.content
      setSyncCode(code)
      setNotes(note.content)
      setIsAuthenticated(true)
      localStorage.setItem('everywhere-notes-code', code)
      localStorage.setItem(`everywhere_notes_${code}`, note.content)
      setError('')
    } catch {
      setError('Cannot reach the sync server. Please try again.')
    }
  }

  const handleJoinSession = () => joinSession(inputCode.trim().toUpperCase())

  const handleScannedValue = (value) => {
    const code = codeFromQrValue(value)
    if (!code) {
      setError('That QR code does not contain a valid sync code.')
      return false
    }
    setInputCode(code)
    setShowScanner(false)
    joinSession(code)
    return true
  }

  const handleLogout = () => {
    if (confirm('Leave this sync session? Your notes will remain saved.')) {
      setIsAuthenticated(false)
      setSyncCode(null)
      setNotes('')
      localStorage.removeItem('everywhere-notes-code')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  const handleChange = (e) => {
    const newContent = e.target.value
    setNotes(newContent)
    latestContentRef.current = newContent
    dirtyRef.current = true
    localStorage.setItem(`everywhere_notes_${syncCode}`, newContent)
    setSyncStatus('Saving…')
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/notes/${encodeURIComponent(syncCode)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: newContent, clientId }),
        })
        if (!response.ok) throw new Error('Save failed')
        const saved = await response.json()
        if (latestContentRef.current === newContent) {
          dirtyRef.current = false
          const pendingRemote = pendingRemoteRef.current
          pendingRemoteRef.current = null
          if (pendingRemote && pendingRemote.revision > saved.revision) {
            latestContentRef.current = pendingRemote.content
            setNotes(pendingRemote.content)
            localStorage.setItem(`everywhere_notes_${syncCode}`, pendingRemote.content)
          }
          setSyncStatus('Synced')
        }
      } catch {
        setSyncStatus('Save failed — keep this page open')
      }
    }, 250)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(syncCode)
    alert('Sync code copied to clipboard!')
  }

  const shareUrl = syncCode
    ? `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(syncCode)}`
    : ''

  if (!isAuthenticated) {
    return (
      <div className="app">
        <div className="auth-container">
          <div className="auth-card">
            <h1>Note Everywhere</h1>
            <p className="auth-subtitle">Shared notes across all your devices</p>
            
            <div className="auth-section">
              <h2>Create New Session</h2>
              <p className="auth-description">
                Generate an 8-character code to start a note session
              </p>
              <button className="btn btn-primary" onClick={handleCreateSession}>
                Generate Code
              </button>
            </div>

            <div className="divider">
              <span>OR</span>
            </div>

            <div className="auth-section">
              <h2>Join Existing Session</h2>
              <p className="auth-description">
                Enter an 8-character sync code to access shared notes
              </p>
              <input
                type="text"
                className="code-input"
                aria-label="Note sync code"
                placeholder="Enter 8-character code"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                maxLength={8}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
              />
              {error && <p className="error-message">{error}</p>}
              <button className="btn btn-secondary" onClick={handleJoinSession}>
                Join Session
              </button>
              <button className="btn btn-scan" onClick={() => setShowScanner(true)}>
                Scan QR Code
              </button>
            </div>
            {showScanner && (
              <QrScanner
                onClose={() => setShowScanner(false)}
                onScan={handleScannedValue}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div>
            <h1>Note Everywhere</h1>
            <p className="subtitle">Synced with code: <strong>{syncCode}</strong></p>
            <p className="subtitle">{syncStatus}</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-small" onClick={() => setShowQR(!showQR)}>
              {showQR ? 'Hide' : 'Show'} QR
            </button>
            <button className="btn btn-small" onClick={copyToClipboard}>
              Copy Code
            </button>
            <button className="btn btn-small btn-logout" onClick={handleLogout}>
              Leave Session
            </button>
          </div>
        </div>
      </header>

      {showQR && (
        <div className="qr-container">
          <div className="qr-card">
            <h3>Scan to Join Session</h3>
            <QRCodeSVG 
              value={shareUrl}
              size={200}
              level="H"
              includeMargin={true}
            />
            <p className="qr-code-text">{syncCode}</p>
            <p className="qr-instruction">Share this QR code or the code above to sync notes</p>
          </div>
        </div>
      )}
      
      <main className="main">
        <textarea
          className="note-textarea"
          aria-label="Shared note"
          value={notes}
          onChange={handleChange}
          placeholder="Start typing... your notes will sync with anyone using the same code!"
          autoFocus
        />
      </main>
      
      <footer className="footer">
        <p>Only people with your code can open this note session</p>
      </footer>
    </div>
  )
}

export default App
