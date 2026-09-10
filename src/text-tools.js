export function compareLines(left, right) {
  const a = left.replace(/\r\n?/g, '\n').split('\n')
  const b = right.replace(/\r\n?/g, '\n').split('\n')
  // Bound quadratic work for large files; preserve every line in the fallback.
  if (a.length * b.length > 2000000) {
    let prefix = 0
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
    let suffix = 0
    while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++
    return [...a.slice(0, prefix).map(text => ({ type: 'same', text })), ...a.slice(prefix, a.length - suffix).map(text => ({ type: 'removed', text })), ...b.slice(prefix, b.length - suffix).map(text => ({ type: 'added', text })), ...a.slice(a.length - suffix).map(text => ({ type: 'same', text }))]
  }
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  const rows = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { rows.push({ type: 'same', text: a[i++] }); j++ }
    else if (i < a.length && (j === b.length || table[i + 1][j] >= table[i][j + 1])) rows.push({ type: 'removed', text: a[i++] })
    else rows.push({ type: 'added', text: b[j++] })
  }
  return rows
}

export function formatJson(text, indent = 2) {
  return JSON.stringify(JSON.parse(text), null, indent)
}
