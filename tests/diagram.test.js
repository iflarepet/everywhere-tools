import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDiagram, routeConnections, templateSkeleton } from '../src/diagram-data.js'

const legacyNode = (id, shape = 'rectangle') => ({ id, shape, x: 10, y: 20, width: 120, height: 80, text: 'Example', color: '#abcdef', borderColor: '#112233', textColor: '#000000' })
test('legacy diagrams preserve labels, colors and connected endpoints', () => {
  const result = parseDiagram(JSON.stringify({ nodes: [legacyNode(1), legacyNode(2, 'cylinder')], connections: [{ from: 1, to: 2, label: 'next' }] }))
  assert.equal(result.kind, 'legacy')
  assert.equal(result.skeleton[0].backgroundColor, '#abcdef')
  assert.equal(result.skeleton[0].label.text, 'Example')
  assert.equal(result.skeleton[2].start.id, 'legacy-1')
  assert.equal(result.skeleton[2].end.id, 'legacy-2')
  assert.equal(result.skeleton[2].label.text, 'next')
  assert.match(result.warning, /cylinders/)
})
test('invalid imports reject before replacing an existing canvas', () => {
  for (const value of ['null', '{}', '{', JSON.stringify({ nodes: [legacyNode(1), legacyNode(1)], connections: [] }), JSON.stringify({ nodes: [legacyNode(1)], connections: [{ from: 1, to: 2 }] }), JSON.stringify({ nodes: [{ ...legacyNode(1), width: -1 }], connections: [] })]) assert.throws(() => parseDiagram(value))
  assert.throws(() => parseDiagram(JSON.stringify({ type: 'excalidraw', elements: [null] })))
  assert.equal(parseDiagram(JSON.stringify({ type: 'excalidraw', elements: [], files: {} })).kind, 'excalidraw')
})
test('every starter connector references shapes in its scene', () => {
  for (const name of ['flowchart', 'architecture', 'mindmap']) {
    const scene = templateSkeleton(name)
    const ids = new Set(scene.filter(e => e.id).map(e => e.id))
    for (const edge of scene.filter(e => e.type === 'arrow')) {
      assert.ok(ids.has(edge.start.id)); assert.ok(ids.has(edge.end.id))
    }
  }
})

test('starter routes span the distance between bound shapes', () => {
  const flow = routeConnections(templateSkeleton('flowchart'))
  const edge = flow.find(e => e.type === 'arrow')
  assert.equal(edge.x, 330)
  assert.equal(edge.y, 136)
  assert.deepEqual(edge.points, [[0, 0], [0, 68]])
  assert.equal(edge.elbowed, true)
})
