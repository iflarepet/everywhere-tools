import test from 'node:test'
import assert from 'node:assert/strict'
import { compareLines, formatJson } from '../src/text-tools.js'

test('line comparison aligns insertions, removals and repeated lines', () => {
  assert.deepEqual(compareLines('a\nb\nc', 'a\nx\nb\nc').map(r => r.type), ['same', 'added', 'same', 'same'])
  assert.deepEqual(compareLines('a\nb\na', 'a\na').map(r => r.type), ['same', 'removed', 'same'])
  assert.ok(compareLines('a\r\nb', 'a\nb').every(r => r.type === 'same'))
  assert.deepEqual(compareLines('before', 'after').map(r => r.type), ['removed', 'added'])
})
test('large comparison preserves both input sequences', () => {
  const a = Array.from({ length: 1600 }, (_, i) => String(i)).join('\n')
  const b = `start\n${a}\nend`
  const rows = compareLines(a, b)
  assert.equal(rows.filter(r => r.type !== 'added').map(r => r.text).join('\n'), a)
  assert.equal(rows.filter(r => r.type !== 'removed').map(r => r.text).join('\n'), b)
})
test('JSON formatting handles scalar values, indentation and invalid input', () => {
  assert.equal(formatJson('{"a":1}'), '{\n  "a": 1\n}')
  assert.equal(formatJson(' { "a": [1, 2] } ', 0), '{"a":[1,2]}')
  assert.equal(formatJson('null'), 'null')
  assert.throws(() => formatJson('{broken'))
})
