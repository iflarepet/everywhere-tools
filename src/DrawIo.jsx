import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, MainMenu, CaptureUpdateAction, convertToExcalidrawElements, exportToBlob, exportToSvg, loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { DIAGRAM_DEFAULTS, DIAGRAM_KEY, parseDiagram, routeConnections, templateSkeleton } from './diagram-data'
import './diagram.css'

window.EXCALIDRAW_ASSET_PATH = '/excalidraw/'

function readDraft() {
  try {
    const raw = localStorage.getItem(DIAGRAM_KEY)
    if (!raw) return { scene: { appState: DIAGRAM_DEFAULTS }, name: 'Untitled diagram' }
    const saved = JSON.parse(raw)
    const { data } = parseDiagram(JSON.stringify(saved.scene))
    if (!data) throw new Error('Invalid draft')
    return { scene: { ...data, appState: { ...DIAGRAM_DEFAULTS, ...data.appState } }, name: typeof saved.name === 'string' ? saved.name : 'Untitled diagram' }
  } catch { return { scene: { appState: DIAGRAM_DEFAULTS }, name: 'Untitled diagram', error: 'Could not restore the local draft. It has been kept untouched; download your work before leaving.' } }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DrawIo() {
  const [draft] = useState(readDraft)
  const [name, setName] = useState(draft.name)
  const [api, setApi] = useState(null)
  const [message, setMessage] = useState(draft.error || 'Your work is saved on this device.')
  const [saveStatus, setSaveStatus] = useState(draft.error ? 'Draft recovery needed' : 'Local autosave')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(0)
  const [grid, setGrid] = useState(draft.scene.appState.gridModeEnabled ?? true)
  const [snap, setSnap] = useState(draft.scene.appState.objectsSnapModeEnabled ?? true)
  const latest = useRef(null)
  const title = useRef(draft.name)
  const timer = useRef(null)
  const blockSave = useRef(Boolean(draft.error))
  const input = useRef(null)
  const fileBase = name.trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'diagram'

  const persist = useCallback(() => {
    if (!latest.current || blockSave.current) return
    try {
      const { elements, appState, files } = latest.current
      const scene = JSON.parse(serializeAsJSON(elements, { ...appState, name: title.current }, files, 'local'))
      localStorage.setItem(DIAGRAM_KEY, JSON.stringify({ name: title.current, scene }))
      setSaveStatus('Saved on this device')
    } catch { setSaveStatus('Autosave unavailable — download to keep your work') }
  }, [])

  const changed = useCallback((elements, appState, files) => {
    latest.current = { elements, appState, files }
    setCount(elements.filter(element => !element.isDeleted && element.type !== 'text').length)
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, 600)
  }, [persist])

  useEffect(() => {
    const flush = () => { clearTimeout(timer.current); persist() }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibility)
    return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility) }
  }, [persist])

  function rename(value) { setName(value); title.current = value; clearTimeout(timer.current); timer.current = setTimeout(persist, 600) }
  function save() {
    if (!api) return
    download(new Blob([serializeAsJSON(api.getSceneElements(), { ...api.getAppState(), name }, api.getFiles(), 'local')], { type: 'application/json' }), `${fileBase}.excalidraw`)
    setMessage('Editable diagram downloaded, including any embedded images.')
  }
  async function exportImage(format) {
    if (!api || busy) return
    if (!api.getSceneElements().length) { setMessage('Add a shape before exporting.'); return }
    setBusy(true)
    try {
      const options = { elements: api.getSceneElements(), appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }, files: api.getFiles(), exportPadding: 30 }
      const blob = format === 'svg' ? new Blob([(await exportToSvg(options)).outerHTML], { type: 'image/svg+xml' }) : await exportToBlob({ ...options, mimeType: 'image/png', maxWidthOrHeight: 4096 })
      download(blob, `${fileBase}.${format}`); setMessage(`${format.toUpperCase()} exported — includes the full diagram, not just the viewport.`)
    } catch (error) { setMessage(`Export failed: ${error.message}. Try downloading the editable file.`) }
    finally { setBusy(false) }
  }
  function replace(elements, files = {}, appState = {}) {
    api.addFiles(Object.values(files))
    api.updateScene({ elements, appState: { ...DIAGRAM_DEFAULTS, ...appState, selectedElementIds: {}, selectedGroupIds: {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    api.setActiveTool({ type: 'selection' })
    api.scrollToContent(elements, { fitToContent: true, viewportZoomFactor: 0.7 })
  }
  function insertTemplate(kind) {
    if (!api) return
    const elements = convertToExcalidrawElements(routeConnections(templateSkeleton(kind)))
    const existing = api.getSceneElements()
    // Append below the existing scene, so inserting a starter never removes work.
    const bottom = existing.length ? Math.max(...existing.map(e => e.y + e.height)) + 100 : 0
    const moved = elements.map(e => ({ ...e, y: e.y + bottom }))
    api.updateScene({ elements: [...existing, ...moved], appState: { selectedElementIds: {}, selectedGroupIds: {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    api.scrollToContent(moved, { fitToContent: true, viewportZoomFactor: 0.7 }); setMessage('Starter added. Double-click a shape to edit its label; drag it to rearrange.')
  }
  async function openFile(file) {
    if (!file || !api) return
    setBusy(true)
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MB.')
      const parsed = parseDiagram(await file.text())
      const scene = parsed.kind === 'legacy' ? { elements: convertToExcalidrawElements(routeConnections(parsed.skeleton)) } : await loadFromBlob(new Blob([JSON.stringify(parsed.data)], { type: 'application/json' }), null, null)
      if (api.getSceneElements().length && !window.confirm('Replace this diagram with the imported file? Download it first to keep a separate copy. You can also undo the replacement.')) return
      replace(scene.elements, scene.files, scene.appState)
      rename(file.name.replace(/\.(json|excalidraw)$/i, ''))
      setMessage(parsed.warning || 'Diagram opened. Shapes, labels, and connectors are editable.')
    } catch (error) { setMessage(`Could not open file: ${error.message}`) }
    finally { setBusy(false) }
  }
  function clear() {
    if (!api || !window.confirm('Start a blank diagram? Download the current diagram to keep a separate copy. You can undo this action.')) return
    replace([]); rename('Untitled diagram'); setMessage('Blank diagram ready. Undo restores the previous scene.')
  }
  return <section className="diagram-workspace" aria-label="Diagram editor">
    <header className="diagram-heading"><div><div className="diagram-eyebrow">DIAGRAM EDITOR</div><label className="sr-only" htmlFor="diagram-name">Diagram name</label><input id="diagram-name" value={name} maxLength={100} onChange={event => rename(event.target.value)} /><p>Flowcharts, architecture, and ideas — one editable canvas.</p></div><div className="actions"><input ref={input} type="file" accept=".json,.excalidraw" hidden onChange={event => { openFile(event.target.files[0]); event.target.value = '' }} /><button disabled={!api || busy} onClick={() => input.current.click()}>Open file</button><button disabled={!api} onClick={save}>Download editable</button><button disabled={!api || busy} onClick={() => exportImage('svg')}>Export SVG</button><button className="primary" disabled={!api || busy} onClick={() => exportImage('png')}>{busy ? 'Working…' : 'Export PNG'}</button></div></header>
    <div className="diagram-commandbar"><div className="actions"><span className="diagram-toolbar-label">Add starter</span><button disabled={!api} onClick={() => insertTemplate('flowchart')}>Flowchart</button><button disabled={!api} onClick={() => insertTemplate('architecture')}>Architecture</button><button disabled={!api} onClick={() => insertTemplate('mindmap')}>Mind map</button></div><div className="actions"><label><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} /> Grid</label><label><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /> Snap</label><button disabled={!api} onClick={() => api.scrollToContent(undefined, { fitToContent: true, viewportZoomFactor: 0.7 })}>Fit diagram</button><button disabled={!api} onClick={clear}>New</button></div></div>
    <div className="diagram-editor"><Excalidraw excalidrawAPI={setApi} initialData={draft.scene} onChange={changed} name={name} theme="light" gridModeEnabled={grid} objectsSnapModeEnabled={snap} aiEnabled={false} validateEmbeddable={false} handleKeyboardGlobally={false} UIOptions={{ canvasActions: { loadScene: false } }}>
      <MainMenu><MainMenu.Item onSelect={() => input.current.click()}>Open diagram file</MainMenu.Item><MainMenu.Item onSelect={save}>Download editable diagram</MainMenu.Item><MainMenu.DefaultItems.SaveAsImage /><MainMenu.Separator /><MainMenu.DefaultItems.Help /><MainMenu.DefaultItems.ChangeCanvasBackground /></MainMenu>
    </Excalidraw></div>
    <footer className="diagram-status"><span>{count} objects · {saveStatus}</span><span>Select: V · Pan: hold Space · Undo: Ctrl/Cmd+Z · Double-click to edit text</span></footer><p className="diagram-message" role="status">{message}</p>
  </section>
}
