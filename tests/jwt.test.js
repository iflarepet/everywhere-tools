import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeJwt, jwtDates } from '../src/jwt.js'
const part = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const token = payload => `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.c2ln`
test('decodes Base64URL Unicode claims and optional Bearer prefix', () => {
  const result = decodeJwt(` Bearer ${token({ name: 'Rizal 你好', exp: 2000000000 })} `)
  assert.equal(result.payload.name, 'Rizal 你好')
  assert.equal(result.header.alg, 'HS256')
  assert.equal(result.signature, 'c2ln')
})
test('rejects malformed, non-object and encrypted tokens', () => {
  for (const value of ['', 'a.b', '!.e30.c2ln', `${part({})}.${part([])}.`, `${part({})}.ew.c2ln`, `${part({})}.${part({})}.!`]) assert.throws(() => decodeJwt(value))
  assert.throws(() => decodeJwt('a.b.c.d.e'), /encrypted/)
  assert.deepEqual(decodeJwt(`${part({ alg: 'none' })}.${part({})}.`).payload, {})
})
test('expiry uses the exact boundary and rejects nonnumeric date claims', () => {
  assert.equal(jwtDates({ exp: 100 }, 100000)[0].state, 'Expired')
  assert.equal(jwtDates({ exp: 101 }, 100000)[0].state, 'Not expired')
  assert.equal(jwtDates({ nbf: 101 }, 100000)[0].state, 'Not active yet')
  assert.equal(jwtDates({ exp: '100' }, 100000)[0].state, 'Invalid claim')
  assert.deepEqual(jwtDates({}), [])
})
