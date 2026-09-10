import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import QrScanner from './QrScanner'

const pattern = /^[A-HJ-NP-Z2-9]{8}$/
async function api(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function Chat() {
  const [code, setCode] = useState('')
  const [input, setInput] = useState('')
  const [name, setName] = useState(() => localStorage.getItem('everywhere-chat-name') || '')
  const [clientId] = useState(() => sessionStorage.getItem('everywhere-chat-id') || (() => { const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; sessionStorage.setItem('everywhere-chat-id', id); return id })())
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Connecting…')
  const [qr, setQr] = useState(false)
  const [scanner, setScanner] = useState(false)
  const bottom = useRef(null)
  const pending = useRef(null)

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('code')?.toUpperCase()
    if (!shared) return
    let active = true
    api(`/api/chat/${encodeURIComponent(shared)}`).then(room => { if (active) { setCode(shared); setMessages(room.messages) } }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!code) return
    const events = new EventSource(`/api/chat/${code}/events`)
    events.onopen = () => setStatus('Connected')
    events.onerror = () => setStatus('Reconnecting…')
    events.onmessage = event => {
      const data = JSON.parse(event.data)
      if (data.messages) setMessages(data.messages)
      else setMessages(old => old.some(m => m.id === data.id) ? old : [...old, data].slice(-500))
    }
    return () => events.close()
  }, [code])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages])

  async function enter(value) {
    const normalized = value?.trim().toUpperCase()
    if (normalized && !pattern.test(normalized)) { setError('Enter a valid 8-character room code.'); return }
    setBusy(true); setError('')
    try {
      const room = normalized ? await api(`/api/chat/${normalized}`) : await api('/api/chat', {})
      const next = normalized || room.code
      setCode(next); setMessages(room.messages); setQr(false)
      if (next !== code) { setMessage(''); pending.current = null; setStatus('Connecting…') }
      window.history.replaceState({}, '', `/chat?code=${next}`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function send(e) {
    e.preventDefault()
    if (!message.trim() || !name.trim() || busy) return
    setBusy(true); setError('')
    localStorage.setItem('everywhere-chat-name', name.trim())
    // Reuse an id after a network failure so retrying never duplicates a message.
    if (!pending.current || pending.current.content !== message) pending.current = { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, content: message }
    try {
      const sent = await api(`/api/chat/${code}/messages`, { ...pending.current, name: name.trim(), clientId })
      setMessages(old => old.some(m => m.id === sent.id) ? old : [...old, sent].slice(-500))
      setMessage(''); pending.current = null
    } catch (e) { setError(`Message not sent. ${e.message}`) } finally { setBusy(false) }
  }
  function scan(value) {
    let next = value.trim().toUpperCase()
    if (!pattern.test(next)) { try { const url = new URL(value); if (url.pathname !== '/chat') return false; next = url.searchParams.get('code')?.toUpperCase() } catch { return false } }
    if (!pattern.test(next || '')) return false
    setScanner(false); setInput(next); enter(next); return true
  }
  async function copy() { try { await navigator.clipboard.writeText(code); setStatus('Room code copied') } catch { setError('Could not copy. Select the room code to copy it manually.') } }
  return <section className="workspace chat-workspace"><div className="page-heading"><div><h1>Chat everywhere</h1><p>{code ? 'Share the room code or QR to invite someone.' : 'Start a room. Share a code. Keep the conversation going.'}</p></div><div className="actions">{code && <span className="connection">● {status}</span>}<button type="button" className="primary" disabled={busy} onClick={() => setScanner(true)} aria-haspopup="dialog">Scan QR code</button></div></div>
    {!code ? <div className="join-grid"><div className="join-panel"><div className="eyebrow">START SOMETHING</div><h2>A room of your own</h2><p>Create a room and invite people with an 8-character code.</p><button className="primary" disabled={busy} onClick={() => enter()}>Create chat room <span aria-hidden="true">↗</span></button></div><form className="join-panel" onSubmit={e => { e.preventDefault(); if (input.trim()) enter(input); else setError('Enter an 8-character room code.') }}><div className="eyebrow">ALREADY INVITED?</div><h2>Join the conversation</h2><label htmlFor="room-code">Room code</label><input id="room-code" className="room-input" value={input} maxLength={8} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="ABCD2345" /><div className="actions"><button className="primary" disabled={busy}>Join room</button><button type="button" disabled={busy} onClick={() => setScanner(true)}>Scan QR code</button></div></form></div> : <><div className="room-bar"><div>ROOM <strong>{code}</strong></div><div className="actions"><button onClick={copy}>Copy code</button><button onClick={() => setQr(!qr)}>{qr ? 'Hide QR' : 'Show QR'}</button><button onClick={() => { setCode(''); setMessages([]); setMessage(''); setError(''); pending.current = null; window.history.replaceState({}, '', '/chat') }}>Leave room</button></div></div>
      {qr && <div className="chat-qr"><QRCodeSVG value={`${window.location.origin}/chat?code=${code}`} size={200} marginSize={4} /><p>Scan to join · {code}</p><small>Anyone with this code can read and send messages.</small></div>}
      <div className="chat-panel"><div className="messages" role="log" aria-label="Room messages" aria-live="polite">{messages.length === 0 && <div className="empty-chat"><h2>You’re in. Say hello.</h2><p>Invite someone with your room code to start chatting.</p></div>}{messages.map(m => <article key={m.id} className={`message ${m.clientId === clientId ? 'mine' : ''}`}><div className="message-meta"><strong>{m.name}</strong><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{m.content}</p></article>)}<div ref={bottom} /></div><form onSubmit={send} className="composer"><label className="name-field">Your name<input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Display name" required /></label><label className="message-field">Message<textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} placeholder="Write a message…" rows={2} required onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form.requestSubmit() } }} /></label><button className="primary" disabled={busy || !name.trim() || !message.trim()}>Send ↗</button></form></div><p className="privacy-note">Anyone with the code can join. The latest 500 messages are saved.</p></>}
    {error && <p role="alert" className="error-message">{error}</p>}{scanner && <QrScanner onClose={() => setScanner(false)} onScan={scan} />}
  </section>
}
