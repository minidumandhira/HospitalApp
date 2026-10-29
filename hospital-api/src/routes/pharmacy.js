import { Router } from 'express'
import { db } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth, requireRole } from '../auth.js'
import { today } from '../dates.js'
import { Problem } from '../errors.js'
import { toCents } from '../billing.js'

// The pharmacy queue. The pharmacist sees the prescription and the stock, but never the diagnosis.
const router = Router()
router.use('/prescriptions', requireAuth, requireRole('admin', 'pharm'))

const QUEUE = `
  SELECT r.id, r.record_date AS date, r.patient_id AS patient, p.name AS patientName,
         r.medicine_id AS med, m.name AS medName, r.quantity AS qty, r.dosage,
         m.stock, m.expiry_date AS expiry, r.dispensed_on AS disp, r.dispensed_cost AS cost
  FROM medical_records r
  JOIN patients p ON p.id = r.patient_id
  JOIN medicines m ON m.id = r.medicine_id`
const blanks = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? '']))

router.get('/prescriptions', (req, res) => {
  res.json(db.prepare(`${QUEUE} ORDER BY r.record_date DESC, r.rowid DESC`).all().map(blanks))
})

// Dispense: take the medicine out of stock and note the cost, all in one transaction.
// If anything fails (expired, not enough stock), nothing at all is changed.
router.post('/prescriptions/:id/dispense', (req, res) => {
  db.transaction(() => {
    const rx = db.prepare('SELECT * FROM medical_records WHERE id = ? AND medicine_id IS NOT NULL').get(req.params.id)
    if (!rx) throw new Problem(404, 'That prescription was not found.')
    if (rx.dispensed_on) throw new Problem(409, 'This prescription was already dispensed.')

    const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(rx.medicine_id)
    if (med.expiry_date && med.expiry_date < today()) throw new Problem(409, `${med.name} has expired. Do not dispense it.`)

    // "AND stock >= ?" makes the check and the subtraction one step, so stock can never go below zero.
    const taken = db.prepare('UPDATE medicines SET stock = stock - ? WHERE id = ? AND stock >= ?').run(rx.quantity, med.id, rx.quantity)
    if (!taken.changes) throw new Problem(409, `Only ${med.stock} of ${med.name} in stock.`)

    // The cost is saved now, at today's price, so a later price change never alters it.
    const cost = toCents(rx.quantity * med.unit_price) / 100
    db.prepare('UPDATE medical_records SET dispensed_on = ?, dispensed_cost = ? WHERE id = ?').run(today(), cost, rx.id)
    audit(req.user.username, `Dispensed ${med.name}`)
  })()
  res.json(blanks(db.prepare(`${QUEUE} WHERE r.id = ?`).get(req.params.id)))
})

export default router