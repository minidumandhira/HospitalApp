import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import { buildDashboard } from '../dashboard.js'
import { reportsFor } from '../reports.js'

const router = Router()

// The reports this role may see (see reports.js for who gets which).
router.get('/reports', requireAuth, requireRole('admin', 'doctor', 'acct'), (req, res) => {
  res.json(reportsFor(req.user.role))
})

// The dashboard numbers. Each role gets only its own parts.
router.get('/dashboard', requireAuth, requireRole('admin', 'doctor', 'nurse', 'reception', 'lab', 'pharm', 'acct'), (req, res) => {
  res.json(buildDashboard(req.user.role))
})

export default router