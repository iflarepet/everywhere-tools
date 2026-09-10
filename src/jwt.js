function decodePart(part, label) {
  if (!part || !/^[A-Za-z0-9_-]+$/.test(part) || part.length % 4 === 1) throw new Error(`${label} is not valid Base64URL.`)
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
    return value
  } catch { throw new Error(`${label} must contain a UTF-8 JSON object.`) }
}

export function decodeJwt(input) {
  const token = input.trim().replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Paste a JWT to decode.')
  if (token.length > 1000000) throw new Error('Token is too large (maximum 1 MB).')
  const parts = token.split('.')
  if (parts.length === 5) throw new Error('This is an encrypted token (JWE). This tool decodes unencrypted, three-part JWTs.')
  if (parts.length !== 3) throw new Error('A JWT must have three parts separated by dots.')
  if (!/^[A-Za-z0-9_-]*$/.test(parts[2]) || parts[2].length % 4 === 1) throw new Error('Signature is not valid Base64URL.')
  return { header: decodePart(parts[0], 'Header'), payload: decodePart(parts[1], 'Payload'), signature: parts[2] }
}

export function jwtDates(payload, now = Date.now()) {
  return [['iat', 'Issued at'], ['nbf', 'Not before'], ['exp', 'Expires at']].filter(([key]) => Object.hasOwn(payload, key)).map(([key, label]) => {
    const value = payload[key]
    const date = new Date(typeof value === 'number' ? value * 1000 : NaN)
    if (!Number.isFinite(value) || Number.isNaN(date.getTime())) return { key, label, value: 'Invalid timestamp', state: 'Invalid claim' }
    return { key, label, value: date.toISOString(), state: key === 'exp' ? (now >= date.getTime() ? 'Expired' : 'Not expired') : key === 'nbf' && now < date.getTime() ? 'Not active yet' : '' }
  })
}
