export const DIAGRAM_KEY = 'everywhere-diagram-v1'
export const DIAGRAM_DEFAULTS = {
  currentItemRoughness: 0, currentItemFontFamily: 2, currentItemFontSize: 20,
  currentItemStrokeColor: '#334155', currentItemBackgroundColor: '#dbeafe',
  currentItemFillStyle: 'solid', currentItemStrokeWidth: 2,
  currentItemArrowType: 'elbow', viewBackgroundColor: '#ffffff', gridSize: 20,
  gridModeEnabled: true, objectsSnapModeEnabled: true, exportBackground: true,
}

const styles = { roughness: 0, strokeColor: '#334155', backgroundColor: '#dbeafe', fillStyle: 'solid', strokeWidth: 2 }
const label = text => ({ text, fontFamily: 2, fontSize: 18, strokeColor: '#0f172a' })
const box = (id, text, x, y, type = 'rectangle', backgroundColor = '#dbeafe') => ({ ...styles, id, type, x, y, width: 180, height: 90, backgroundColor, label: label(text), roundness: type === 'rectangle' ? { type: 3 } : null })
const arrow = (from, to, x, y, text = '') => ({ ...styles, type: 'arrow', x, y, start: { id: from }, end: { id: to }, label: text ? label(text) : undefined, endArrowhead: 'arrow' })

export function routeConnections(skeleton) {
  const nodes = new Map(skeleton.filter(e => e.id).map(e => [e.id, e]))
  return skeleton.map(edge => {
    if (edge.type !== 'arrow') return edge
    const from = nodes.get(edge.start.id), to = nodes.get(edge.end.id)
    const dx = to.x + to.width / 2 - from.x - from.width / 2
    const dy = to.y + to.height / 2 - from.y - from.height / 2
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const sign = Math.sign(horizontal ? dx : dy) || 1
    const start = horizontal ? [from.x + from.width / 2 + sign * (from.width / 2 + 6), from.y + from.height / 2] : [from.x + from.width / 2, from.y + from.height / 2 + sign * (from.height / 2 + 6)]
    const end = horizontal ? [to.x + to.width / 2 - sign * (to.width / 2 + 6), to.y + to.height / 2] : [to.x + to.width / 2, to.y + to.height / 2 - sign * (to.height / 2 + 6)]
    const x = end[0] - start[0], y = end[1] - start[1]
    const points = x === 0 || y === 0 ? [[0, 0], [x, y]] : horizontal ? [[0, 0], [x / 2, 0], [x / 2, y], [x, y]] : [[0, 0], [0, y / 2], [x, y / 2], [x, y]]
    return { ...edge, x: start[0], y: start[1], points, elbowed: true }
  })
}

export function templateSkeleton(name) {
  if (name === 'flowchart') return [
    box('start', 'Start', 240, 40, 'ellipse', '#dcfce7'),
    box('process', 'Process', 240, 210),
    { ...box('decision', 'Approved?', 220, 390, 'diamond', '#fef3c7'), width: 220, height: 150 },
    box('complete', 'Complete', 560, 420, 'ellipse', '#dcfce7'),
    box('review', 'Review', 240, 650, 'rectangle', '#fee2e2'),
    arrow('start', 'process', 330, 130), arrow('process', 'decision', 330, 300),
    arrow('decision', 'complete', 440, 465, 'Yes'), arrow('decision', 'review', 330, 540, 'No'),
  ]
  if (name === 'architecture') return [
    box('client', 'Web / mobile', 40, 200), box('api', 'API service', 360, 200, 'rectangle', '#e0e7ff'),
    box('store', 'Database', 700, 80, 'rectangle', '#dcfce7'), box('worker', 'Background jobs', 700, 340, 'rectangle', '#fef3c7'),
    arrow('client', 'api', 220, 245, 'HTTPS'), arrow('api', 'store', 540, 245, 'Read / write'), arrow('api', 'worker', 540, 245, 'Queue'),
  ]
  if (name === 'mindmap') return [
    box('idea', 'Main idea', 350, 240, 'ellipse', '#e0e7ff'),
    box('one', 'Explore', 30, 80), box('two', 'Plan', 670, 80, 'rectangle', '#dcfce7'),
    box('three', 'Build', 30, 430, 'rectangle', '#fef3c7'), box('four', 'Learn', 670, 430, 'rectangle', '#fee2e2'),
    ...['one', 'two', 'three', 'four'].map(id => arrow('idea', id, 440, 285)),
  ]
  throw new Error('Unknown template')
}

export function parseDiagram(text) {
  if (text.length > 20 * 1024 * 1024) throw new Error('Choose a diagram smaller than 20 MB.')
  let data
  try { data = JSON.parse(text) } catch { throw new Error('This file is not valid JSON. Open an Excalidraw file or a diagram JSON file.') }
  if (!data || typeof data !== 'object') throw new Error('Invalid diagram file.')
  if (data.type === 'excalidraw' && Array.isArray(data.elements)) {
    if (data.elements.length > 10000 || data.elements.some(e => !e || typeof e.id !== 'string' || typeof e.type !== 'string' || !Number.isFinite(e.x) || !Number.isFinite(e.y))) throw new Error('Invalid or oversized diagram elements.')
    return { kind: 'excalidraw', data }
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.connections)) throw new Error('Unsupported file. Use .excalidraw or the previous editor’s JSON format; draw.io XML is not supported.')
  if (data.nodes.length > 2000 || data.connections.length > 5000) throw new Error('This legacy diagram is too large.')
  const ids = new Set()
  const shapeMap = { rectangle: 'rectangle', roundedRect: 'rectangle', circle: 'ellipse', ellipse: 'ellipse', diamond: 'diamond', cylinder: 'rectangle', parallelogram: 'rectangle' }
  let mapped = false
  const skeleton = data.nodes.map(node => {
    if (!node || !['string', 'number'].includes(typeof node.id) || !shapeMap[node.shape] || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(node[key]) && Math.abs(node[key]) < 1000000) || node.width <= 0 || node.height <= 0 || typeof node.text !== 'string') throw new Error('A legacy shape has invalid coordinates, size, or text.')
    const id = `legacy-${node.id}`
    if (ids.has(id)) throw new Error('Duplicate shape IDs in diagram.')
    ids.add(id)
    mapped ||= ['cylinder', 'parallelogram'].includes(node.shape)
    const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
    return { ...styles, id, type: shapeMap[node.shape], x: node.x, y: node.y, width: node.width, height: node.height, backgroundColor: color(node.color, '#dbeafe'), strokeColor: color(node.borderColor, '#334155'), roundness: node.shape === 'roundedRect' ? { type: 3 } : null, label: { ...label(node.text), strokeColor: color(node.textColor, '#0f172a') } }
  })
  for (const connection of data.connections) {
    if (!connection || !ids.has(`legacy-${connection.from}`) || !ids.has(`legacy-${connection.to}`)) throw new Error('A connector references a missing shape.')
    const from = data.nodes.find(node => node.id === connection.from)
    if (!from) throw new Error('Invalid connector source.')
    skeleton.push(arrow(`legacy-${connection.from}`, `legacy-${connection.to}`, from.x + from.width / 2, from.y + from.height, typeof connection.label === 'string' ? connection.label : ''))
  }
  return { kind: 'legacy', skeleton, warning: mapped ? 'Legacy cylinders and parallelograms were converted to editable rectangles. Your original file is unchanged.' : '' }
}
