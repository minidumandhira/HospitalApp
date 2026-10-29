import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { browser } from './helpers.js'

// Use a throw-away database and backup folder so the tests never touch your real data.
process.env.DB_FILE = path.join(os.tmpdir(), `hms-admin-test-${process.pid}.db`)
process.env.BACKUP_DIR = path.join(os.tmpdir(), `hms-backups-${process.pid}`)

const { db } = await import('../src/db.js')
const { seedIfEmpty } = await import('../src/seed.js')
const { createApp } = await import('../src/app.js')
const { today } = await import('../src/dates.js')
const { ensureDailyBackup, listBackups } = await import('../src/backup.js')
const { BACKUP_DIR, BACKUPS_KEPT } = await import('../src/config.js')

let server
const base = () => `http://localhost:${server.address().port}`
const who = {}
const one = (sql, ...args) => db.prepare(sql).get(...args)
let p1, p2, d1

before(async () => {
  seedIfEmpty()
  server = await new Promise((resolve) => { const s = createApp().listen(0, () => resolve(s)) })
  for (const name of ['admin', 'doctor', 'nurse', 'reception', 'lab', 'pharmacy', 'accounts', 'patient']) {
    who[name] = browser(base)
    await who[name]('POST', '/api/auth/login', { username: name, password: name + '123' })
  }
  who.anon = browser(base)
  p1 = one("SELECT id FROM patients WHERE name = 'Nimali Fernando'").id
  p2 = one("SELECT id FROM patients WHERE name = 'Kasun Silva'").id
  d1 = one("SELECT id FROM doctors WHERE name = 'Dr. Amara Perera'").id
})
after(() => { server.closeAllConnections(); server.close(); fs.rmSync(BACKUP_DIR, { recursive: true, force: true }) })

test('the daily backup is made once a day', async () => {
  assert.deepEqual(listBackups(), [])
  const first = await ensureDailyBackup()
  assert.match(first.name, /^hospital-\d{8}-\d{6}\.db$/)
  assert.ok(first.size > 0)
  assert.equal(await ensureDailyBackup(), null)             // already done today
  assert.equal(listBackups().length, 1)
})

test('reports: each role gets only its own reports', async () => {
  const titles = async (role) => (await who[role]('GET', '/api/reports')).body.map((r) => r.title)
  assert.equal((await titles('admin')).length, 8)
  const doctor = await titles('doctor')
  assert.ok(doctor.some((t) => t.startsWith('Patient report')) && doctor.some((t) => t.startsWith('Laboratory report')))
  assert.ok(!doctor.some((t) => /Revenue|Outstanding|Pharmacy|Staff/.test(t)))
  const accounts = await titles('accounts')
  assert.deepEqual(accounts.map((t) => t.split(':')[0]), ['Revenue report', 'Outstanding invoices', 'Pharmacy report'])
  for (const role of ['nurse', 'reception', 'lab', 'pharmacy', 'patient']) assert.equal((await who[role]('GET', '/api/reports')).status, 403)
  assert.equal((await who.anon('GET', '/api/reports')).status, 401)
})

test('reports and dashboard show the real numbers', async () => {
  // one finished consultation (Rs 2,500), invoiced, with Rs 1,000 paid
  const appt = await who.reception('POST', '/api/appts', { patient: p2, doctor: d1, when: `${today()}T09:00` })
  await who.reception('PUT', `/api/appts/${appt.body.id}`, { status: 'Checked-in' })
  await who.reception('PUT', `/api/appts/${appt.body.id}`, { status: 'Completed' })
  const bill = await who.accounts('POST', '/api/bills', { patient: p2 })
  await who.accounts('POST', `/api/bills/${bill.body.id}/payments`, { amount: 1000, method: 'Cash' })
  const nurse = (await who.admin('GET', '/api/staff')).body.find((s) => s.name === 'Nurse Kumari')
  await who.admin('POST', `/api/staff/${nurse.id}/attendance`, { status: 'Present' })

  const find = async (role, start) => (await who[role]('GET', '/api/reports')).body.find((r) => r.title.startsWith(start))
  assert.deepEqual((await find('admin', 'Patient report')).rows, [['Female', 1], ['Male', 1]])
  assert.deepEqual((await find('accounts', 'Revenue')).rows, [[today().slice(0, 7), 'Rs 1,000']])
  assert.deepEqual((await find('accounts', 'Outstanding')).rows, [['INV-0001', 'Kasun Silva', 'Rs 1,500']])
  assert.ok((await find('accounts', 'Pharmacy')).rows.some((r) => r[0] === 'Paracetamol 500 mg' && r[2] === 'Rs 2,000'))   // 400 x Rs 5
  assert.deepEqual((await find('admin', 'Appointment')).rows, [['Completed', 1]])
  assert.deepEqual((await find('admin', 'Staff report: days')).rows.find((r) => r[0] === 'Nurse Kumari'), ['Nurse Kumari', 1])

  const dash = async (role) => (await who[role]('GET', '/api/dashboard')).body
  assert.deepEqual(Object.keys(await dash('accounts')).sort(), ['outstanding', 'revenue'])
  const accounts = await dash('accounts')
  assert.equal(accounts.revenue, 1000)
  assert.equal(accounts.outstanding, 1500)
  assert.deepEqual(Object.keys(await dash('reception')).sort(), ['admitted', 'patients', 'today'])
  assert.deepEqual(Object.keys(await dash('lab')), ['openLabs'])
  assert.deepEqual(Object.keys(await dash('pharmacy')), ['pharmacyAlerts'])
  assert.ok((await dash('pharmacy')).pharmacyAlerts.includes('Amoxicillin 250 mg — Low stock'))
  assert.ok((await dash('pharmacy')).pharmacyAlerts.includes('Amoxicillin 250 mg — Expires soon'))
  const reception = await dash('reception')
  assert.equal(reception.today.count, 1)
  assert.equal(reception.today.list[0].patientName, 'Kasun Silva')
  assert.equal((await who.patient('GET', '/api/dashboard')).status, 403)
  assert.equal((await who.anon('GET', '/api/dashboard')).status, 401)
})

test('audit log: only the administrator, newest first, in pages, and it cannot be edited', async () => {
  const page = await who.admin('GET', '/api/audit?limit=5')
  assert.equal(page.status, 200)
  assert.equal(page.body.entries.length, 5)
  assert.deepEqual(Object.keys(page.body.entries[0]).sort(), ['a', 'id', 't', 'u'])
  const ids = page.body.entries.map((e) => e.id)
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a))                       // newest first
  assert.ok(page.body.next)

  const older = await who.admin('GET', `/api/audit?limit=5&before=${page.body.next}`)
  assert.ok(older.body.entries.every((e) => e.id < page.body.next))           // the next page continues where this one ended
  assert.equal((await who.admin('GET', '/api/audit?limit=100000')).body.entries.length <= 500, true)
  assert.ok((await who.admin('GET', '/api/audit')).body.entries.some((e) => e.a === 'Invoice generated' && e.u === 'accounts'))

  for (const role of ['doctor', 'accounts', 'patient']) assert.equal((await who[role]('GET', '/api/audit')).status, 403)
  assert.equal((await who.anon('GET', '/api/audit')).status, 401)
  assert.equal((await who.admin('PUT', '/api/audit/1', { a: 'edited' })).status, 404)       // no way to change it
  assert.equal((await who.admin('DELETE', '/api/audit/1')).status, 404)
})

test('backup and restore bring the data back and keep the audit trail and sessions', async () => {
  const made = await who.admin('POST', '/api/backups')
  assert.equal(made.status, 201)
  assert.ok(fs.existsSync(path.join(BACKUP_DIR, made.body.name)))
  assert.ok((await who.admin('GET', '/api/backups')).body.some((b) => b.name === made.body.name))

  // change things after the backup
  await who.admin('POST', '/api/patients', { name: 'Added After Backup' })
  await who.pharmacy('POST', `/api/meds/${one("SELECT id FROM medicines WHERE name LIKE 'Atorvastatin%'").id}/restock`, { qty: 1000 })
  await who.admin('DELETE', `/api/patients/${p1}`)             // even a deleted patient comes back
  const auditBefore = one('SELECT COUNT(*) AS n FROM audit_log').n

  const restored = await who.admin('POST', `/api/backups/${made.body.name}/restore`)
  assert.equal(restored.status, 200)
  assert.match(restored.body.safetyCopy, /before-restore\.db$/)
  assert.ok(fs.existsSync(path.join(BACKUP_DIR, restored.body.safetyCopy)))

  assert.equal(one("SELECT COUNT(*) AS n FROM patients WHERE name = 'Added After Backup'").n, 0)   // gone
  assert.equal(one("SELECT stock FROM medicines WHERE name LIKE 'Atorvastatin%'").stock, 150)       // back to what it was
  assert.equal(one('SELECT COUNT(*) AS n FROM invoices').n, 1)                                      // the invoice from before is intact
  assert.ok(one('SELECT COUNT(*) AS n FROM audit_log').n > auditBefore)                             // the audit log only grew
  assert.ok((await who.admin('GET', '/api/audit?limit=3')).body.entries.some((e) => e.a.startsWith('Backup restored')))
  assert.equal((await who.admin('GET', '/api/auth/me')).status, 200)                                // nobody was signed out
  assert.equal((await who.doctor('GET', '/api/auth/me')).status, 200)
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)                                      // safety switched back on
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)

  // the app still works after a restore
  assert.equal((await who.reception('POST', '/api/patients', { name: 'After Restore' })).status, 201)
})

test('backups: bad names, wrong roles and old copies', async () => {
  assert.equal((await who.admin('POST', '/api/backups/nothing.db/restore')).status, 400)
  assert.equal((await who.admin('POST', `/api/backups/${encodeURIComponent('../../etc/passwd')}/restore`)).status, 400)
  assert.equal((await who.admin('POST', '/api/backups/hospital-20200101-000000.db/restore')).status, 404)
  for (const role of ['doctor', 'pharmacy', 'patient']) {
    assert.equal((await who[role]('GET', '/api/backups')).status, 403)
    assert.equal((await who[role]('POST', '/api/backups')).status, 403)
  }

  for (let i = 0; i < BACKUPS_KEPT + 3; i++) await who.admin('POST', '/api/backups')
  const regular = listBackups().filter((b) => !b.safety)
  assert.equal(regular.length, BACKUPS_KEPT)                                                         // old ones are removed
})