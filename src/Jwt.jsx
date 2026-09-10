import { useEffect, useState } from 'react'
import { decodeJwt, jwtDates } from './jwt'

export default function Jwt() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  function decode() {
    setStatus(''); setError('')
    try { setResult(decodeJwt(input)); setNow(Date.now()) } catch (e) { setResult(null); setError(e.message) }
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); setStatus('Copied to clipboard') }
    catch { setStatus('Could not copy. Select the decoded text and copy it manually.') }
  }
  const dates = result ? jwtDates(result.payload, now) : []
  return <section className="workspace jwt-workspace">
    <div className="page-heading"><div><h1>JWT decoder</h1><p>Inspect a token’s header and payload. Decoding stays on your device.</p></div><button className="primary" onClick={decode}>Decode JWT</button></div>
    <div className="editor-panel jwt-input"><div className="panel-bar"><label htmlFor="jwt-input">Encoded token</label><button onClick={() => { setInput(''); setResult(null); setError(''); setStatus('') }}>Clear</button></div><textarea id="jwt-input" value={input} onChange={e => { setInput(e.target.value); setResult(null); setError(''); setStatus('') }} placeholder="Paste a JWT or Bearer token…" spellCheck="false" autoComplete="off" autoCapitalize="off" /></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {result && <><div className="jwt-notice">Decoded only · Signature not verified. Claims may have been modified.</div>
      <div className="editor-grid">{[['header', 'Header'], ['payload', 'Payload']].map(([key, label]) => <div className="editor-panel" key={key}><div className="panel-bar"><label htmlFor={`jwt-${key}`}>{label}</label><button onClick={() => copy(result[key])}>Copy {key}</button></div><textarea id={`jwt-${key}`} readOnly spellCheck="false" value={JSON.stringify(result[key], null, 2)} /></div>)}</div>
      <div className="jwt-claims"><h2>Token timestamps</h2>{dates.length ? <dl>{dates.map(date => <div key={date.key}><dt>{date.label} <code>({date.key})</code></dt><dd>{date.value}{date.state && <strong>{date.state}</strong>}</dd></div>)}</dl> : <p>No issued-at, not-before, or expiry claims are present.</p>}<p>Times shown in UTC. Timestamp status does not verify the token’s authenticity.</p></div>
    </>}
    <p role="status" className="status-message">{status}</p>
  </section>
}
