import { Router } from 'express'
import { db, newId } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth, requireRole } from '../auth.js'
import { today } from '../dates.js'
import { isDate, toApi } from '../fields.js'
import { RESOURCES } from '../resources.js'

// Actions that are more than "save these fields".
const router = Router()

// Add stock to a medicine. The addition happens inside the database in one step, so two
// people restocking at the same moment can never overwrite each other.
router.post('/meds/:id/restock', requireAuth, requireRole('admin', 'pharm'), (req, res) => {
  const qty = Number(req.body?.qty)
  const expiry = req.body?.expiry || null
  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) {
    return res.status(400).json({ error: 'Enter a whole quantity between 1 and 100000.' })
  }
  if (expiry && !isDate(expiry)) return res.status(400).json({ error: 'The expiry date must be a valid date.' })

  const done = db.prepare('UPDATE medicines SET stock = stock + ?, expiry_date = COALESCE(?, expiry_date) WHERE id = ?')
    .run(qty, expiry, req.params.id)
  if (!done.changes) return res.status(404).json({ error: 'That medicine was not found.' })

  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id)
  audit(req.user.username, `Restocked ${med.name}`)
  res.json(toApi(RESOURCES.meds, med))
})

// Mark an employee Present or Absent for today. Marking again the same day changes the mark.
router.post('/staff/:id/attendance', requireAuth, requireRole('admin'), (req, res) => {
  const status = req.body?.status
  if (!['Present', 'Absent'].includes(status)) return res.status(400).json({ error: 'The mark must be Present or Absent.' })

  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'That employee was not found.' })

  db.prepare(`INSERT INTO attendance (id, employee_id, day, status) VALUES (?, ?, ?, ?)
              ON CONFLICT (employee_id, day) DO UPDATE SET status = excluded.status`)
    .run(newId(), row.id, today(), status)
  audit(req.user.username, `Attendance: ${row.name} ${status.toLowerCase()}`)
  res.json(RESOURCES.staff.decorate([toApi(RESOURCES.staff, row)])[0])
})

export default router