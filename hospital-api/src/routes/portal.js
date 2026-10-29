import { Router } from 'express'
import { db, newId } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth, requireRole } from '../auth.js'
import { nowLocal } from '../dates.js'
import { Problem } from '../errors.js'
import { f, cleanBody } from '../fields.js'

// The patient portal. Every route here works on the signed-in patient's own record only.
// The patient id comes from the session, never from the request, so a patient cannot ask for
// someone else's data by changing a number.
const router = Router()
router.use('/my', requireAuth, requireRole('patient'))

const myId = (req) => {
  if (!req.user.patientId) throw new Problem(403, 'Your account has no patient record. Please contact the reception desk.')
  return req.user.patientId
}

const LIST = `
  SELECT a.id, a.scheduled_at AS "when", a.reason, a.status, a.doctor_id AS doctor,
         d.name AS doctorName, dep.name AS dept
  FROM appointments a
  JOIN doctors d ON d.id = a.doctor_id
  LEFT JOIN departments dep ON dep.id = d.department_id`
const blanks = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? '']))

router.get('/my/appointments', (req, res) => {
  res.json(db.prepare(`${LIST} WHERE a.patient_id = ? ORDER BY a.scheduled_at`).all(myId(req)).map(blanks))
})

// What a patient may send when booking. Their own id and the status are set by the server.
const BOOKING = {
  fields: {
    doctor: f.ref('doctor_id', 'Doctor', 'doctors', { required: true }),
    when: f.time('scheduled_at', 'Date and time', { required: true }),
    reason: f.text('reason', 'Reason for visit'),
  },
}

router.post('/my/appointments', (req, res) => {
  const patient = myId(req)
  const { values, error } = cleanBody(BOOKING, req.body, null)
  if (error) throw new Problem(400, error)
  if (values.when < nowLocal()) throw new Problem(400, 'Choose a time in the future.')

  const id = newId()
  try {
    db.prepare("INSERT INTO appointments (id, patient_id, doctor_id, scheduled_at, reason, status) VALUES (?, ?, ?, ?, ?, 'Scheduled')")
      .run(id, patient, values.doctor, values.when, values.reason)
  } catch (err) {
    // Say nothing about who holds the slot.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Problem(409, 'That time is not available. Please choose another time.')
    throw err
  }
  audit(req.user.username, 'Patient booked appointment')
  res.status(201).json(blanks(db.prepare(`${LIST} WHERE a.id = ?`).get(id)))
})

router.post('/my/appointments/:id/cancel', (req, res) => {
  const patient = myId(req)
  // Someone else's appointment looks exactly like one that does not exist.
  const row = db.prepare('SELECT id, status FROM appointments WHERE id = ? AND patient_id = ?').get(req.params.id, patient)
  if (!row) throw new Problem(404, 'That appointment was not found.')
  if (row.status !== 'Scheduled') throw new Problem(409, 'Only a scheduled appointment can be cancelled.')

  db.prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ?").run(row.id)
  audit(req.user.username, 'Patient cancelled appointment')
  res.json(blanks(db.prepare(`${LIST} WHERE a.id = ?`).get(row.id)))
})

export default router