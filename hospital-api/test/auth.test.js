import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'

// Use a throw-away database so the tests never touch your real data.
process.env.DB_FILE = path.join(os.tmpdir(), `hms-auth-test-${process.pid}.db`)

const { db } = await import('../src/db.js')
const { seedIfEmpty } = await import('../src/seed.js')
const { createApp } = await import('../src/app.js')
const { requireAuth, requireRole } = await import('../src/auth.js')
const { MAX_FAILED_LOGINS, SESSION_IDLE_MS } = await import('../src/config.js')

// A second tiny app with one admin-only route, to test the role check.
const mini = express()
mini.use(cookieParser())
mini.get('/admin-only', requireAuth, requireRole('admin'), (req, res) => res.json({ ok: true }))

const listen = (app) => new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
let api, adminOnly
before(async () => { seedIfEmpty(); api = await listen(createApp()); adminOnly = await listen(mini) })
after(() => { api.closeAllConnections(); api.close(); adminOnly.closeAllConnections(); adminOnly.close() })

// A tiny browser: remembers the session cookie between calls.
function browser(server = () => api) {
  let cookie = ''
  const call = async (method, url, body, target = server()) => {
    const res = await fetch(`http://localhost:${target.address().port}${url}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      cookie = pair.endsWith('=') ? '' : pair
    }
    return { status: res.status, body: await res.json().catch(() => null), setCookie: res.headers.getSetCookie(), res }
  }
  call.cookie = () => cookie
  return call
}
const login = (b, username, password) => b('POST', '/api/auth/login', { username, password })
const audited = (text) => db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE ?').get(`%${text}%`).n

test('the health check shows nothing private', async () => {
  const r = await browser()('GET', '/api/health')
  assert.deepEqual(r.body, { ok: true })
})

test('sign in sets a protected cookie, /me works, and nothing secret is returned', async () => {
  const b = browser()
  assert.equal((await b('GET', '/api/auth/me')).status, 401)           // not signed in yet
  const r = await login(b, 'Admin', 'admin123')                         // username is not case sensitive
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.user.role, 'admin')
  assert.ok(!JSON.stringify(r.body).includes('password'))
  assert.match(r.setCookie[0], /HttpOnly/i)
  assert.match(r.setCookie[0], /SameSite=Lax/i)
  const me = await b('GET', '/api/auth/me')
  assert.equal(me.body.user.username, 'admin')
  // the database holds only a hash of the token, never the token
  const token = b.cookie().split('=')[1]
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(token).n, 0)
})

test('wrong username and wrong password give the same answer', async () => {
  const a = await login(browser(), 'nobody', 'whatever1')
  const b = await login(browser(), 'nurse', 'wrong-password1')
  assert.equal(a.status, 401)
  assert.equal(b.status, 401)
  assert.equal(a.body.error, b.body.error)
  assert.equal((await login(browser(), '', '')).status, 400)
  assert.ok(audited('Failed sign-in') >= 2)                             // failures are in the audit log
})

test('sign out ends the session', async () => {
  const b = browser()
  await login(b, 'doctor', 'doctor123')
  assert.equal((await b('GET', '/api/auth/me')).status, 200)
  await b('POST', '/api/auth/logout')
  assert.equal((await b('GET', '/api/auth/me')).status, 401)
})

test('a session expires after 15 idle minutes', async () => {
  const b = browser()
  await login(b, 'reception', 'reception123')
  db.prepare('UPDATE sessions SET last_seen = ? WHERE user_id = (SELECT id FROM users WHERE username = ?)')
    .run(Date.now() - SESSION_IDLE_MS - 1000, 'reception')
  assert.equal((await b('GET', '/api/auth/me')).status, 401)
})

test('too many wrong passwords lock the account, even for the right password', async () => {
  const b = browser()
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) assert.equal((await login(b, 'lab', 'wrong-pass1')).status, 401)
  const fifth = await login(b, 'lab', 'wrong-pass1')
  assert.equal(fifth.status, 429)
  const right = await login(b, 'lab', 'lab123')
  assert.equal(right.status, 429)                                       // locked: the right password is refused too
  assert.match(right.body.error, /minute/)
  // when the lock runs out the account works again
  db.prepare("UPDATE users SET locked_until = ? WHERE username = 'lab'").run(new Date(Date.now() - 1000).toISOString())
  assert.equal((await login(b, 'lab', 'lab123')).status, 200)
  assert.equal(db.prepare("SELECT failed_attempts FROM users WHERE username = 'lab'").get().failed_attempts, 0)
})

test('change password: checks, then signs out the other browsers', async () => {
  const phone = browser(), laptop = browser()
  await login(phone, 'pharmacy', 'pharmacy123')
  await login(laptop, 'pharmacy', 'pharmacy123')

  const change = (current, next) => laptop('POST', '/api/auth/change-password', { currentPassword: current, newPassword: next })
  assert.equal((await change('not-it-123', 'NewPass123')).body.error, 'Your current password is incorrect.')
  assert.match((await change('pharmacy123', 'short1')).body.error, /at least 8/)
  assert.match((await change('pharmacy123', 'onlyletters')).body.error, /letter and one number/)
  assert.match((await change('pharmacy123', 'Pharmacy999')).body.error, /username/)
  assert.match((await change('pharmacy123', 'pharmacy123')).body.error, /already using/)
  assert.equal((await change('pharmacy123', 'Fresh-Pass-77')).status, 200)

  assert.equal((await laptop('GET', '/api/auth/me')).status, 200)       // this browser stays signed in
  assert.equal((await phone('GET', '/api/auth/me')).status, 401)        // the other one is signed out
  assert.equal((await login(browser(), 'pharmacy', 'pharmacy123')).status, 401)   // old password is dead
  assert.equal((await login(browser(), 'pharmacy', 'Fresh-Pass-77')).status, 200)
  assert.equal((await browser()('POST', '/api/auth/change-password', {})).status, 401) // must be signed in
})

test('a patient can create an account, and bad details are refused', async () => {
  const b = browser()
  const good = { name: 'Tharindu Perera', dob: '1990-05-05', phone: '0771110000', username: 'tharindu', password: 'Secret-pass-12' }
  const register = (changes = {}) => b('POST', '/api/auth/register', { ...good, ...changes })

  assert.match((await register({ name: 'x' })).body.error, /full name/)
  assert.match((await register({ dob: '2999-01-01' })).body.error, /date of birth/)
  assert.match((await register({ phone: 'abc' })).body.error, /phone/)
  assert.match((await register({ username: 'a b' })).body.error, /Username/)
  assert.match((await register({ password: 'short' })).body.error, /at least 8/)
  assert.match((await register({ password: 'Tharindu-1' })).body.error, /username/)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'tharindu'").get().n, 0)

  const ok = await register()
  assert.equal(ok.status, 201)
  assert.equal(ok.body.user.role, 'patient')
  assert.ok(ok.body.user.patientId)
  assert.equal((await b('GET', '/api/auth/me')).body.user.username, 'tharindu')    // signed in straight away
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(ok.body.user.patientId)
  assert.equal(patient.name, 'Tharindu Perera')
  assert.equal((await register()).status, 409)                                       // the username is now taken
  assert.equal((await register({ username: 'ADMIN' })).status, 409)
})

test('role checks: signed out gets 401, wrong role 403, right role 200', async () => {
  const anon = browser(), doctor = browser(), admin = browser()
  await login(doctor, 'doctor', 'doctor123')
  await login(admin, 'admin', 'admin123')
  const ask = (b) => b('GET', '/admin-only', undefined, adminOnly)
  assert.equal((await ask(anon)).status, 401)
  assert.equal((await ask(doctor)).status, 403)
  assert.equal((await ask(admin)).status, 200)
})

test('unknown routes and broken requests get tidy JSON answers', async () => {
  const b = browser()
  assert.equal((await b('GET', '/api/nothing-here')).status, 404)
  const res = await fetch(`http://localhost:${api.address().port}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
  })
  assert.equal(res.status, 400)
  assert.ok((await res.json()).error)
})