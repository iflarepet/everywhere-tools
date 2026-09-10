import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const file = resolve(process.env.CHAT_FILE || 'data/chat.json')
const rooms = new Map(existsSync(file) ? Object.entries(JSON.parse(readFileSync(file, 'utf8'))) : [])
const listeners = new Map()
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function persist() {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(Object.fromEntries(rooms)))
  renameSync(`${file}.tmp`, file)
}
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)) }
async function body(req) {
  const chunks = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > 20000) throw new Error('Message is too large'); chunks.push(chunk) }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}
export async function handleChat(req, res, path) {
  if (path !== '/api/chat' && !path.startsWith('/api/chat/')) return false
  try {
    if (path === '/api/chat' && req.method === 'POST') {
      let code
      do { code = Array.from(randomBytes(8), b => alphabet[b % alphabet.length]).join('') } while (rooms.has(code))
      const room = { messages: [], createdAt: new Date().toISOString() }
      rooms.set(code, room)
      try { persist() } catch (e) { rooms.delete(code); throw e }
      json(res, 201, { code, ...room }); return true
    }
    const match = path.match(/^\/api\/chat\/([A-HJ-NP-Z2-9]{8})(?:\/(events|messages))?$/)
    if (!match) { json(res, 400, { error: 'Invalid room code or chat endpoint' }); return true }
    const [, code, action] = match
    const room = rooms.get(code)
    if (!room) { json(res, 404, { error: 'Room not found. Check the code and try again.' }); return true }
    if (req.method === 'GET' && !action) { json(res, 200, room); return true }
    if (req.method === 'GET' && action === 'events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'connection': 'keep-alive', 'x-accel-buffering': 'no' })
      res.write(`data: ${JSON.stringify(room)}\n\n`)
      const clients = listeners.get(code) || new Set()
      clients.add(res); listeners.set(code, clients)
      const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20000)
      res.on('close', () => { clearInterval(heartbeat); clients.delete(res); if (!clients.size) listeners.delete(code) })
      return true
    }
    if (req.method === 'POST' && action === 'messages') {
      let data
      try { data = await body(req) } catch { json(res, 400, { error: 'Invalid or oversized message' }); return true }
      if (typeof data.content !== 'string' || !data.content.trim() || data.content.length > 4000 || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 40 || typeof data.clientId !== 'string' || data.clientId.length > 100 || (data.id !== undefined && (typeof data.id !== 'string' || data.id.length > 100))) { json(res, 400, { error: 'A name (up to 40 characters) and message (up to 4,000 characters) are required.' }); return true }
      const existing = room.messages.find(m => m.id === data.id && m.clientId === data.clientId)
      if (existing) { json(res, 200, existing); return true }
      const message = { id: data.id || randomUUID(), name: data.name.trim(), content: data.content.trim(), clientId: data.clientId, createdAt: new Date().toISOString() }
      const previous = room.messages
      room.messages = [...previous, message].slice(-500)
      try { persist() } catch (e) { room.messages = previous; throw e }
      for (const client of listeners.get(code) || []) client.write(`data: ${JSON.stringify(message)}\n\n`)
      json(res, 201, message); return true
    }
    json(res, 405, { error: 'Method not allowed' })
  } catch (e) { console.error('Chat request failed:', e.message); if (!res.headersSent) json(res, 500, { error: 'Could not save the room. Please try again.' }); else res.end() }
  return true
}
