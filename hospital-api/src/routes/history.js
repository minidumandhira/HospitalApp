import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { Problem } from '../errors.js'
import { buildHistory } from '../history.js'
import { RESOURCES } from '../resources.js'

const router = Router()

// A patient's own medical history.
router.get('/my/record', requireAuth, requireRole('patient'), (req, res) => {
  if (!req.user.patientId) throw new Problem(403, 'Your account has no patient record. Please contact the reception desk.')
  res.json(buildHistory(req.user.patientId, { includeLabs: true }))
})

// Any patient's history, for the clinical staff. Lab results only go to roles that may read lab tests.
router.get('/patients/:id/history', requireAuth, requireRole('admin', 'doctor', 'nurse'), (req, res) => {
  const history = buildHistory(req.params.id, { includeLabs: RESOURCES.labs.read.includes(req.user.role) })
  if (!history) throw new Problem(404, 'That patient was not found.')
  res.json(history)
})

export default router