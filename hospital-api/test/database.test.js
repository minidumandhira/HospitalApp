import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

// Use a throw-away database so the tests never touch your real data.
process.env.DB_FILE = path.join(os.tmpdir(), `hms-test-${process.pid}.db`)

const { db, newId } = await import('../src/db.js')
const { seedIfEmpty } = await import('../src/seed.js')

const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
const id = (table, where = '1=1') => db.prepare(`SELECT id FROM ${table} WHERE ${where} LIMIT 1`).get().id

before(() => seedIfEmpty())

test('starting data is added once', () => {
  assert.equal(count('roles'), 8)
  assert.equal(count('users'), 8)
  assert.equal(count('doctors'), 2)
  assert.equal(count('medicines'), 3)
  assert.equal(seedIfEmpty(), false)       // a second run adds nothing
  assert.equal(count('users'), 8)
})

test('passwords are stored as bcrypt hashes, never as text', () => {
  const { password_hash } = db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get()
  assert.match(password_hash, /^\$2[aby]\$/)
  assert.notEqual(password_hash, 'admin123')
})

test('the demo patient login is linked to a patient record', () => {
  const row = db.prepare("SELECT patient_id FROM users WHERE username = 'patient'").get()
  assert.ok(row.patient_id)
})

test('the database refuses a doctor being booked twice at the same time', () => {
  const book = (status = 'Scheduled') => db.prepare(
    'INSERT INTO appointments (id, patient_id, doctor_id, scheduled_at, status) VALUES (?, ?, ?, ?, ?)')
    .run(newId(), id('patients'), id('doctors'), '2030-01-01 10:00', status)
  book()
  assert.throws(() => book(), /UNIQUE/)
  book('Cancelled')                          // a cancelled booking does not block the slot
})

test('stock can never go negative', () => {
  assert.throws(() => db.prepare('UPDATE medicines SET stock = -1').run(), /CHECK/)
})

test('rows must point at things that exist', () => {
  assert.throws(() => db.prepare(
    'INSERT INTO appointments (id, patient_id, doctor_id, scheduled_at) VALUES (?, ?, ?, ?)')
    .run(newId(), 'no-such-patient', id('doctors'), '2030-02-02 09:00'), /FOREIGN KEY/)
})

test('invalid statuses, usernames and dates are rejected', () => {
  assert.throws(() => db.prepare("UPDATE appointments SET status = 'Maybe'").run(), /CHECK/)
  assert.throws(() => db.prepare(
    "INSERT INTO users (id, username, name, role_id, password_hash) VALUES (?, 'admin', 'x', 'admin', 'x')")
    .run(newId()), /UNIQUE/)
  assert.throws(() => db.prepare(
    "INSERT INTO admissions (id, patient_id, daily_rate, admitted_on, discharged_on) VALUES (?, ?, 100, '2030-03-10', '2030-03-01')")
    .run(newId(), id('patients')), /CHECK/)
})

test('a payment must be above zero', () => {
  const patient = id('patients')
  const invoice = newId()
  db.prepare("INSERT INTO invoices (id, invoice_no, patient_id, invoice_date, total) VALUES (?, 'INV-0001', ?, '2030-01-01', 100)")
    .run(invoice, patient)
  assert.throws(() => db.prepare(
    "INSERT INTO payments (id, invoice_id, paid_on, amount, method) VALUES (?, ?, '2030-01-01', 0, 'Cash')")
    .run(newId(), invoice), /CHECK/)
})