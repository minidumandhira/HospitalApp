import { Router } from 'express'
import { db } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth, requireRole } from '../auth.js'
import { createBackup, listBackups, restoreBackup } from '../backup.js'

// Administrator only: the audit trail and backups.
// There is no route to change or delete audit entries. The log can only grow.
const router = Router()
router.use(['/audit', '/backups'], requireAuth, requireRole('admin'))

// Newest first. Ask for more with ?before=<id of the last entry you have>.
router.get('/audit', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500)
  const before = parseInt(req.query.before, 10)
  const entries = db.prepare(
    `SELECT id, at AS t, username AS u, action AS a FROM audit_log
     ${before ? 'WHERE id < ?' : ''} ORDER BY id DESC LIMIT ?`).all(...(before ? [before, limit] : [limit]))
  res.json({ entries, next: entries.length === limit ? entries.at(-1).id : null })
})

router.get('/backups', (req, res) => {
  res.json(listBackups().map(({ ms, ...backup }) => backup))
})

router.post('/backups', async (req, res) => {
  const backup = await createBackup()
  audit(req.user.username, `Backup made: ${backup.name}`)
  res.status(201).json(backup)
})

router.post('/backups/:name/restore', async (req, res) => {
  const result = await restoreBackup(req.params.name)
  audit(req.user.username, `Backup restored: ${result.restored}`)
  res.json({ ok: true, ...result })
})

export default router