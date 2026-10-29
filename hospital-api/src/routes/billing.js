import { Router } from 'express'
import { db, newId } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth, requireRole } from '../auth.js'
import { today } from '../dates.js'
import { Problem } from '../errors.js'
import { createInvoice, invoiceShape, toCents, totalOf, unbilledCharges } from '../billing.js'

// Administrator and accountant only. Invoices are never deleted, as with real financial records.
const router = Router()
router.use('/bills', requireAuth, requireRole('admin', 'acct'))

const METHODS = ['Cash', 'Card', 'Bank transfer', 'Insurance']
const patientExists = (id) => typeof id === 'string' && db.prepare('SELECT 1 FROM patients WHERE id = ?').get(id)

router.get('/bills', (req, res) => {
  res.json(db.prepare('SELECT * FROM invoices ORDER BY rowid DESC').all().map(invoiceShape))
})

// What would be billed for this patient right now.
router.get('/bills/preview', (req, res) => {
  if (!patientExists(req.query.patient)) throw new Problem(404, 'That patient was not found.')
  const items = unbilledCharges(req.query.patient)
  res.json({ items, total: totalOf(items) })
})

// Create the invoice. The request names only the patient. The server works out the rest.
router.post('/bills', (req, res) => {
  const patient = req.body?.patient
  if (!patientExists(patient)) throw new Problem(404, 'That patient was not found.')
  const id = createInvoice(patient)
  audit(req.user.username, 'Invoice generated')
  res.status(201).json(invoiceShape(db.prepare('SELECT * FROM invoices WHERE id = ?').get(id)))
})

router.post('/bills/:id/payments', (req, res) => {
  const { amount, method } = req.body ?? {}
  const cents = typeof amount === 'number' || typeof amount === 'string' ? toCents(amount) : NaN
  if (!Number.isFinite(cents) || cents < 1) throw new Problem(400, 'Enter an amount above zero.')
  if (!METHODS.includes(method)) throw new Problem(400, `The method must be one of: ${METHODS.join(', ')}.`)

  const invoice = db.transaction(() => {
    const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id)
    if (!row) throw new Problem(404, 'That invoice was not found.')
    const paid = db.prepare('SELECT amount FROM payments WHERE invoice_id = ?').all(row.id).reduce((s, p) => s + toCents(p.amount), 0)
    const balance = toCents(row.total) - paid
    if (cents > balance) {
      throw new Problem(400, balance === 0 ? 'This invoice is already fully paid.' : `Enter an amount up to Rs ${(balance / 100).toLocaleString('en-US')}.`)
    }
    db.prepare('INSERT INTO payments (id, invoice_id, paid_on, amount, method) VALUES (?, ?, ?, ?, ?)')
      .run(newId(), row.id, today(), cents / 100, method)
    audit(req.user.username, `Payment recorded for ${row.invoice_no}`)
    return row
  })()
  res.status(201).json(invoiceShape(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id)))
})

export default router