import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { rowsFor } from '../listing.js'
import { RESOURCES } from '../resources.js'

// Everything the signed-in role may see, in one request. The React app calls this once after
// sign-in. The server decides what is included, so nothing has to be hidden in the browser.
const router = Router()

const userShape = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role_id, patient: u.patient_id ?? '' })

router.get('/bootstrap', requireAuth, (req, res) => {
  const data = {}
  for (const [key, spec] of Object.entries(RESOURCES)) {
    const rows = rowsFor(spec, req.user.role)
    if (rows) data[key] = rows
  }
  if (req.user.role === 'admin') data.users = db.prepare('SELECT * FROM users ORDER BY username').all().map(userShape)
  res.json(data)
})

export default router