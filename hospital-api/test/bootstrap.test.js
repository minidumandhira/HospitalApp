import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { browser } from './helpers.js'

process.env.DB_FILE = path.join(os.tmpdir(), `hms-boot-test-${process.pid}.db`)
const { seedIfEmpty } = await import('../src/seed.js')
const { createApp } = await import('../src/app.js')

let server
const base = () => `http://localhost:${server.address().port}`
before(async () => { seedIfEmpty(); server = await new Promise((resolve) => { const s = createApp().listen(0, () => resolve(s)) }) })
after(() => { server.closeAllConnections(); server.close() })

const as = async (name) => { const b = browser(base); await b('POST', '/api/auth/login', { username: name, password: name + '123' }); return b }

test('bootstrap: each role gets only the records it may see, in one request', async () => {
  const anon = browser(base)
  assert.equal((await anon('GET', '/api/bootstrap')).status, 401)

  const keys = async (role) => Object.keys((await (await as(role))('GET', '/api/bootstrap')).body).sort()
  assert.deepEqual(await keys('admin'), ['adm', 'appts', 'depts', 'doctors', 'labs', 'leaves', 'meds', 'patients', 'records', 'staff', 'users'])
  assert.deepEqual(await keys('doctor'), ['appts', 'depts', 'doctors', 'labs', 'meds', 'patients', 'records'])
  assert.deepEqual(await keys('reception'), ['adm', 'appts', 'depts', 'doctors', 'patients'])
  assert.deepEqual(await keys('lab'), ['depts', 'doctors', 'labs', 'patients'])
  assert.deepEqual(await keys('pharmacy'), ['depts', 'doctors', 'meds', 'patients'])
  assert.deepEqual(await keys('accounts'), ['depts', 'doctors', 'patients'])
  assert.deepEqual(await keys('patient'), ['depts', 'doctors'])

  const lab = await (await as('lab'))('GET', '/api/bootstrap')
  assert.deepEqual(Object.keys(lab.body.patients[0]).sort(), ['id', 'name'])         // names only
  const admin = await (await as('admin'))('GET', '/api/bootstrap')
  assert.ok(!JSON.stringify(admin.body.users).includes('$2'))                        // no password hashes
  assert.deepEqual(admin.body.staff[0].att, {})
})