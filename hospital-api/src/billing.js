import { db, newId } from './db.js'
import { today } from './dates.js'
import { Problem } from './errors.js'

// Money is added up in whole cents, so 0.1 + 0.2 can never give 0.30000000000000004.
export const toCents = (n) => Math.round(Number(n) * 100)

// Which table each kind of charge comes from.
const TABLE = { appts: 'appointments', labs: 'lab_tests', records: 'medical_records', adm: 'admissions' }

// Everything finished for this patient that is not on an invoice yet.
// The amounts are worked out here from the database. The client never supplies them.
export function unbilledCharges(patientId) {
  const items = []

  db.prepare(
    `SELECT a.id, d.name AS doctor, d.fee FROM appointments a JOIN doctors d ON d.id = a.doctor_id
     WHERE a.patient_id = ? AND a.status = 'Completed' AND a.billed = 0 ORDER BY a.scheduled_at`)
    .all(patientId)
    .forEach((a) => items.push({ text: `Consultation – ${a.doctor}`, amount: a.fee, source: 'appts', id: a.id }))

  db.prepare(
    `SELECT id, test_name, price FROM lab_tests
     WHERE patient_id = ? AND status = 'Completed' AND billed = 0 ORDER BY requested_on`)
    .all(patientId)
    .forEach((l) => items.push({ text: `Laboratory – ${l.test_name}`, amount: l.price, source: 'labs', id: l.id }))

  db.prepare(
    `SELECT r.id, r.quantity, r.dispensed_cost, m.name FROM medical_records r JOIN medicines m ON m.id = r.medicine_id
     WHERE r.patient_id = ? AND r.dispensed_on IS NOT NULL AND r.billed = 0 ORDER BY r.record_date`)
    .all(patientId)
    .forEach((r) => items.push({ text: `Pharmacy – ${r.name} × ${r.quantity}`, amount: r.dispensed_cost, source: 'records', id: r.id }))

  db.prepare(
    `SELECT id, admitted_on, discharged_on, daily_rate FROM admissions
     WHERE patient_id = ? AND discharged_on IS NOT NULL AND billed = 0 ORDER BY admitted_on`)
    .all(patientId)
    .forEach((a) => {
      const days = Math.max(1, Math.round((Date.parse(a.discharged_on) - Date.parse(a.admitted_on)) / 864e5))
      items.push({ text: `Admission – ${days} day(s)`, amount: days * a.daily_rate, source: 'adm', id: a.id })
    })

  return items
}

export const totalOf = (items) => items.reduce((sum, item) => sum + toCents(item.amount), 0) / 100

// Make an invoice from a patient's unbilled charges. Everything happens in one transaction:
// either the invoice is saved and every charge is marked as billed, or nothing changes at all.
export function createInvoice(patientId) {
  return db.transaction(() => {
    const items = unbilledCharges(patientId)
    if (!items.length) throw new Problem(400, 'This patient has no unbilled charges.')

    for (const item of items) {
      // "AND billed = 0" means a charge can only ever be billed once, even if two requests race.
      const done = db.prepare(`UPDATE ${TABLE[item.source]} SET billed = 1 WHERE id = ? AND billed = 0`).run(item.id)
      if (!done.changes) throw new Problem(409, 'A charge was just billed by someone else. Please try again.')
    }

    const last = db.prepare("SELECT MAX(CAST(SUBSTR(invoice_no, 5) AS INTEGER)) AS n FROM invoices").get().n ?? 0
    const id = newId()
    db.prepare('INSERT INTO invoices (id, invoice_no, patient_id, invoice_date, total) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'INV-' + String(last + 1).padStart(4, '0'), patientId, today(), totalOf(items))
    const addItem = db.prepare('INSERT INTO invoice_items (id, invoice_id, description, amount, source, source_id) VALUES (?, ?, ?, ?, ?, ?)')
    items.forEach((item) => addItem.run(newId(), id, item.text, item.amount, item.source, item.id))
    return id
  })()
}

// An invoice row -> the object the React app uses: its lines, its payments and where it stands.
export function invoiceShape(row) {
  const items = db.prepare('SELECT description, amount, source, source_id FROM invoice_items WHERE invoice_id = ? ORDER BY rowid')
    .all(row.id).map((i) => ({ text: i.description, amount: i.amount, source: i.source, id: i.source_id }))
  const pay = db.prepare('SELECT paid_on, amount, method FROM payments WHERE invoice_id = ? ORDER BY rowid')
    .all(row.id).map((p) => ({ d: p.paid_on, a: p.amount, m: p.method }))
  const paidCents = pay.reduce((sum, p) => sum + toCents(p.a), 0)
  const totalCents = toCents(row.total)
  return {
    id: row.id, no: row.invoice_no, patient: row.patient_id, date: row.invoice_date, total: row.total,
    paid: paidCents / 100, balance: (totalCents - paidCents) / 100,
    status: paidCents >= totalCents ? 'Paid' : paidCents > 0 ? 'Partial' : 'Unpaid',
    items, pay,
  }
}