import { useState } from 'react'
import Notes from './Notes'
import Chat from './Chat'
import Jwt from './Jwt.jsx'
import { compareLines, formatJson } from './text-tools'
import './notes.css'
import './index.css'

const tools = [
  { id: 'notes', name: 'Notes', description: 'A shared notepad, wherever you are.', icon: 'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3 M16 3l5 5-10 10H6v-5Z', color: 'blue' },
  { id: 'chat', name: 'Chat everywhere', description: 'One code. One room. Everyone together.', icon: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0Z M6 11h10 M6 15h6', color: 'green' },
  { id: 'compare', name: 'Compare text', description: 'Spot the differences in text or files.', icon: 'M9 3H3v18h6 M15 3h6v18h-6 M7 8h10l-3-3 M17 16H7l3 3', color: 'orange' },
  { id: 'json', name: 'JSON beautifier', description: 'Make your JSON clear and readable.', icon: 'M8 3H6a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2 M16 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2', color: 'purple' },
  { id: 'jwt', name: 'JWT decoder', description: 'Read the header and claims in a token.', icon: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z M8 12h8 M12 8v8', color: 'green' },
]

function Icon({ path }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg> }

function Compare() {
  const [texts, setTexts] = useState(['', ''])
  const [names, setNames] = useState(['Original text', 'Changed text'])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  function update(index, value) { setTexts(old => old.map((text, i) => i === index ? value : text)); setResult(null) }
  async function upload(index, file) {
    if (!file) return
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a text file smaller than 1 MB.')
      const text = await file.text()
      if (text.includes('\0')) throw new Error('Choose a plain-text file, such as TXT, CSV, JSON, or source code.')
      update(index, text); setNames(old => old.map((name, i) => i === index ? file.name : name)); setError('')
    } catch (e) { setError(e.message) }
  }
  return <section className="workspace"><div className="page-heading"><div><h1>Compare text</h1><p>Paste two versions or upload a file on each side.</p></div><button className="primary" onClick={() => setResult(compareLines(...texts))}>Compare text</button></div>
    <div className="editor-grid">{texts.map((text, i) => <div className="editor-panel" key={i}><div className="panel-bar"><label htmlFor={`text-${i}`}>{names[i]}</label><label className="upload">Upload file<input type="file" aria-label={`Upload ${i === 0 ? 'original' : 'changed'} file`} onChange={e => { upload(i, e.target.files[0]); e.target.value = '' }} /></label></div><textarea id={`text-${i}`} value={text} onChange={e => update(i, e.target.value)} placeholder={i ? 'Paste the changed version…' : 'Paste the original version…'} spellCheck="false" /><div className="panel-footer">{text.length.toLocaleString()} characters</div></div>)}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    {result && <div className="diff-result"><div className="panel-bar"><strong>{result.every(r => r.type === 'same') ? 'The texts are identical' : 'Differences'}</strong><span>{result.filter(r => r.type === 'added').length} added · {result.filter(r => r.type === 'removed').length} removed</span></div><pre>{result.map((row, i) => <div key={i} className={`diff-line ${row.type}`}><span aria-label={row.type}>{row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ' '}</span>{row.text || ' '}</div>)}</pre></div>}
  </section>
}

function Json() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [indent, setIndent] = useState('2')
  const [status, setStatus] = useState('')
  function format(minify = false) { try { setOutput(formatJson(input, minify ? 0 : Number(indent))); setStatus('Valid JSON') } catch (e) { setOutput(''); setStatus(`Invalid JSON: ${e.message}`) } }
  async function copy() { try { await navigator.clipboard.writeText(output); setStatus('Copied to clipboard') } catch { setStatus('Could not copy. Select the output and copy it manually.') } }
  function download() { const url = URL.createObjectURL(new Blob([output], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'formatted.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  return <section className="workspace"><div className="page-heading"><div><h1>JSON beautifier</h1><p>Format, validate, and minify JSON on your device.</p></div><div className="actions"><label>Indent <select value={indent} onChange={e => setIndent(e.target.value)}><option value="2">2 spaces</option><option value="4">4 spaces</option></select></label><button onClick={() => format(true)}>Minify</button><button className="primary" onClick={() => format()}>Beautify JSON</button></div></div><div className="editor-grid"><div className="editor-panel"><div className="panel-bar"><label htmlFor="json-input">Input JSON</label><button onClick={() => { setInput(''); setOutput(''); setStatus('') }}>Clear</button></div><textarea id="json-input" placeholder={'{"hello":"everywhere"}'} value={input} onChange={e => { setInput(e.target.value); setOutput(''); setStatus('') }} spellCheck="false" /></div><div className="editor-panel"><div className="panel-bar"><label htmlFor="json-output">Formatted output</label><div className="actions"><button onClick={copy} disabled={!output}>Copy</button><button onClick={download} disabled={!output}>Download</button></div></div><textarea id="json-output" readOnly value={output} placeholder="Your formatted JSON will appear here…" spellCheck="false" /></div></div><p role="status" className={status.startsWith('Invalid') ? 'error-message' : 'status-message'}>{status}</p></section>
}

export default function App() {
  const page = window.location.pathname.split('/')[1]
  const current = tools.find(tool => tool.id === page)
  return <><header className="shell-header"><a href="/" className="brand"><span className="brand-mark">e<span>·</span></span>everywhere<span className="brand-light"> / tools</span></a><a className="home-link" href="/">All tools <span aria-hidden="true">↗</span></a></header>
    {!current ? <main className="home"><div className="eyebrow">YOUR EVERYDAY TOOLKIT</div><h1>A little less friction.<br /><span>A lot more done.</span></h1><p className="home-intro">Pick a tool and get straight to it.</p><nav className="tool-grid" aria-label="Tools">{tools.map((tool, i) => <a className={`tool-card ${tool.color}`} href={`/${tool.id}`} key={tool.id}><div className="card-top"><div className="tool-icon"><Icon path={tool.icon} /></div><span className="card-number">0{i + 1}</span></div><h2>{tool.name}</h2><p>{tool.description}</p><div className="card-bottom"><span>Open tool</span><span aria-hidden="true">↗</span></div></a>)}</nav><div className="home-footer"><span>Five tools. One place.</span><span>Made for the way you work.</span></div></main> : <><nav className="tool-nav" aria-label="Tools">{tools.map(tool => <a href={`/${tool.id}`} aria-current={page === tool.id ? 'page' : undefined} key={tool.id}>{tool.name}</a>)}</nav>{page === 'notes' ? <div className="notes-scope"><Notes /></div> : page === 'chat' ? <Chat /> : page === 'compare' ? <Compare /> : page === 'json' ? <Json /> : <Jwt />}</>}
  </>
}

