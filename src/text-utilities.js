const linesOf = text => text.replace(/\r\n?/g, '\n').split('\n')
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' })

export function transformText(text, operation) {
  switch (operation) {
    case 'upper': return text.toUpperCase()
    case 'lower': return text.toLowerCase()
    case 'title': return text.toLowerCase().replace(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu, word => {
      const [first, ...rest] = Array.from(word)
      return first.toUpperCase() + rest.join('')
    })
    case 'dedupe': return [...new Set(linesOf(text))].join('\n')
    case 'sort-asc': return linesOf(text).sort(collator.compare).join('\n')
    case 'sort-desc': return linesOf(text).sort((a, b) => collator.compare(b, a)).join('\n')
    case 'trim': return linesOf(text).map(line => line.trim()).join('\n')
    case 'blank-lines': return linesOf(text).filter(line => line.trim().length > 0).join('\n')
    default: throw new Error('Unknown text operation')
  }
}

export function textStats(text) {
  return {
    characters: Array.from(text).length,
    words: text.trim() ? text.trim().split(/\s+/u).length : 0,
    lines: text ? linesOf(text).length : 0,
  }
}
