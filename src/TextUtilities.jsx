import { useMemo, useState } from 'react'
import { textStats, transformText } from './text-utilities'

const groups = [
  { label: 'Change case', operations: [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case']] },
  { label: 'Clean up', operations: [['dedupe', 'Remove duplicate lines'], ['trim', 'Trim each line'], ['blank-lines', 'Remove blank lines']] },
  { label: 'Sort lines', operations: [['sort-asc', 'A → Z'], ['sort-desc', 'Z → A']] },
]

function Counts({ text }) {
  const stats = useMemo(() => textStats(text), [text])
  return <div className="panel-footer text-counts">{Object.entries(stats).map(([label, value]) => <span key={label}><strong>{value.toLocaleString()}</strong> {label}</span>)}</div>
}

export default function TextUtilities() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState(null)
  const [operation, setOperation] = useState('')
  const [status, setStatus] = useState('')
  function run(id, label) {
    setOutput(transformText(input, id)); setOperation(label); setStatus(`${label} applied.`)
  }
  async function copy() {
    try { await navigator.clipboard.writeText(output); setStatus('Result copied to clipboard.') }
    catch { setStatus('Could not copy. Select the result and copy it manually.') }
  }
  return <section className="workspace text-workspace">
    <div className="page-heading"><div><h1>Text utilities</h1><p>Clean up and transform text on your device.</p></div><button onClick={() => { setInput(''); setOutput(null); setOperation(''); setStatus('Text cleared.') }} disabled={!input && output === null}>Clear all</button></div>
    <div className="text-toolbar">{groups.map(group => <fieldset key={group.label}><legend>{group.label}</legend><div className="actions">{group.operations.map(([id, label]) => <button key={id} disabled={!input} onClick={() => run(id, label)}>{label}</button>)}</div></fieldset>)}</div>
    <div className="editor-grid"><div className="editor-panel"><div className="panel-bar"><label htmlFor="utility-input">Input text</label></div><textarea id="utility-input" value={input} onChange={e => { setInput(e.target.value); setOutput(null); setOperation(''); setStatus('') }} placeholder="Paste or type your text here…" spellCheck="false" /><Counts text={input} /></div>
      <div className="editor-panel"><div className="panel-bar"><label htmlFor="utility-output">Result{operation && <span className="text-operation"> · {operation}</span>}</label><div className="actions"><button disabled={output === null} onClick={() => { setInput(output); setOutput(null); setOperation(''); setStatus('Result moved to input. Choose another operation to continue.') }}>Use as input</button><button disabled={output === null} onClick={copy}>Copy</button></div></div><textarea id="utility-output" readOnly value={output ?? ''} placeholder="Choose an operation to see the result…" spellCheck="false" /><Counts text={output ?? ''} /></div></div>
    <p className="text-help">Duplicate removal matches exact lines and keeps the first occurrence. Trim first to ignore surrounding spaces. Word counts use whitespace; character counts use Unicode code points.</p>
    <p className="status-message" role="status">{status}</p>
  </section>
}
