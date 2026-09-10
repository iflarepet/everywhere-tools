import test from 'node:test'
import assert from 'node:assert/strict'
import { textStats, transformText } from '../src/text-utilities.js'

test('case conversion handles Unicode and apostrophes without losing layout', () => {
  assert.equal(transformText('Hello\nÉcole', 'upper'), 'HELLO\nÉCOLE')
  assert.equal(transformText('Hello\nÉCOLE', 'lower'), 'hello\nécole')
  assert.equal(transformText("  DON'T stop\nélan vital", 'title'), "  Don't Stop\nÉlan Vital")
})
test('cleanup preserves exact-line semantics and supports chaining', () => {
  const text = ' apple \r\nbanana\rapple\nbanana\n\n  '
  assert.equal(transformText(text, 'dedupe'), ' apple \nbanana\napple\n\n  ')
  const trimmed = transformText(text, 'trim')
  assert.equal(transformText(transformText(trimmed, 'blank-lines'), 'dedupe'), 'apple\nbanana')
  assert.equal(transformText('  a  b \n\tc\t', 'trim'), 'a  b\nc')
})
test('sorting is numeric-aware in both directions', () => {
  assert.equal(transformText('item10\nitem2\nitem1', 'sort-asc'), 'item1\nitem2\nitem10')
  assert.equal(transformText('item2\nitem1\nitem10', 'sort-desc'), 'item10\nitem2\nitem1')
})
test('counts handle empty input, mixed line endings and Unicode', () => {
  assert.deepEqual(textStats(''), { characters: 0, words: 0, lines: 0 })
  assert.deepEqual(textStats('hi 😀\nthere'), { characters: 10, words: 3, lines: 2 })
  assert.equal(textStats('a\r\nb\rc\n').lines, 4)
  assert.equal(textStats(' \t\n').words, 0)
  assert.equal(transformText('', 'dedupe'), '')
})
