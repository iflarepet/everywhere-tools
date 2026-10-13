import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('notes and chat sync, isolate rooms, reject invalid input, and survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'everywhere-test-'))
  let child
  let base
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: '0', NOTES_FILE: join(dir, 'notes.json'), CHAT_FILE: join(dir, 'chat.json') }, stdio: ['ignore', 'pipe', 'pipe'] })
    const output = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000)
      child.once('error', e => { clearTimeout(timer); reject(e) })
      child.stdout.once('data', data => { clearTimeout(timer); resolve(data.toString()) })
    })
    base = output.match(/http:\/\/[^\s]+/)[0]
  }
  async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done } }
  async function request(path, method = 'GET', data) {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) })
    return { status: response.status, data: await response.json() }
  }
  const streams = []
  try {
    await start()
    assert.deepEqual(await request("/api/health"), { status: 200, data: { status: "ok" } })
    const note = (await request('/api/sessions', 'POST')).data
    assert.match(note.code, /^[A-HJ-NP-Z2-9]{8}$/)
    await request(`/api/notes/${note.code}`, 'PUT', { content: 'Shared note', clientId: 'device-one' })
    assert.equal((await request(`/api/notes/${note.code}`)).data.content, 'Shared note')
    const room = (await request('/api/chat', 'POST', {})).data
    const other = (await request('/api/chat', 'POST', {})).data
    // Two independent subscribers receive the same newly sent message.
    const readers = []
    for (let i = 0; i < 2; i++) {
      const controller = new AbortController(); streams.push(controller)
      const response = await fetch(`${base}/api/chat/${room.code}/events`, { signal: controller.signal })
      assert.equal(response.headers.get('content-type'), 'text/event-stream')
      const reader = response.body.getReader(); await reader.read(); readers.push(reader)
    }
    const payload = { id: 'retry-safe-id', name: 'Rizal', content: 'Hello from another device', clientId: 'client-one' }
    const sent = await request(`/api/chat/${room.code}/messages`, 'POST', payload)
    assert.equal(sent.status, 201)
    for (const reader of readers) { const event = await reader.read(); assert.match(new TextDecoder().decode(event.value), /Hello from another device/) }
    assert.equal((await request(`/api/chat/${room.code}/messages`, 'POST', payload)).status, 200)
    assert.equal((await request(`/api/chat/${room.code}`)).data.messages.length, 1)
    assert.equal((await request(`/api/chat/${other.code}`)).data.messages.length, 0)
    assert.equal((await request(`/api/chat/${room.code}/messages`, 'POST', { ...payload, content: '' })).status, 400)
    assert.equal((await request('/api/chat/AAAAAAAA')).status, 404)
    assert.equal((await request('/api/chat/invalid')).status, 400)
    assert.equal((await request('/api/no-such-endpoint')).status, 404)
    for (const route of ['/', '/notes', '/chat', '/compare', '/json', '/jwt', '/text', '/drawio']) assert.equal((await fetch(base + route)).status, 200)
    streams.forEach(c => c.abort())
    // The copied notes service batches disk writes for 100ms.
    await new Promise(resolve => setTimeout(resolve, 150))
    await stop(); await start()
    assert.equal((await request(`/api/chat/${room.code}`)).data.messages[0].content, payload.content)
    assert.equal((await request(`/api/notes/${note.code}`)).data.content, 'Shared note')
  } finally { streams.forEach(c => c.abort()); await stop(); await rm(dir, { recursive: true, force: true }) }
})

