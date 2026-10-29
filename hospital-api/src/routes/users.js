import { Router } from 'express'
import { db, newId } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth, requireRole } from '../auth.js'
import { checkPasswordRule, hashPassword } from '../passwords.js'
import { endAllSessions, endOtherSessions } from '../sessions.js'

// Administrator only: create, change and remove staff accounts.
// The password field is called pw, the same name the React form uses. It is never sent back.
const router = Router()
router.use(requireAuth, requireRole('admin'))

const shape = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role_id, patient: u.patient_id ?? '' })
const find = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id)
const roleExists = (id) => db.prepare('SELECT 1 FROM roles WHERE id = ?').get(id)
const USERNAME = /^[a-z0-9._-]{3,30}$/

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY username').all().map(shape))
})

router.post('/', async (req, res) => {
  const { username, name, role, pw } = req.body ?? {}
  const login = typeof username === 'string' ? username.trim().toLowerCase() : ''
  const fullName = typeof name === 'string' ? name.trim() : ''

  if (!USERNAME.test(login)) return res.status(400).json({ error: 'Username: 3 to 30 letters, numbers, dots, dashes or underscores.' })
  if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'Enter the full name.' })
  if (typeof role !== 'string' || !roleExists(role)) return res.status(400).json({ error: 'Choose a role.' })
  if (role === 'patient') return res.status(400).json({ error: 'Patient accounts are created by patients on the sign-in page.' })
  const problem = checkPasswordRule(pw, login)
  if (problem) return res.status(400).json({ error: problem })

  const id = newId()
  try {
    db.prepare('INSERT INTO users (id, username, name, role_id, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, login, fullName, role, await hashPassword(pw))
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That username is taken.' })
    throw err
  }
  audit(req.user.username, 'Added user')
  res.status(201).json(shape(find(id)))
})

router.put('/:id', async (req, res) => {
  const user = find(req.params.id)
  if (!user) return res.status(404).json({ error: 'That user was not found.' })
  const { username, name, role, pw } = req.body ?? {}

  const login = username === undefined ? user.username : typeof username === 'string' ? username.trim().toLowerCase() : ''
  const fullName = name === undefined ? user.name : typeof name === 'string' ? name.trim() : ''
  const newRole = role === undefined || role === '' ? user.role_id : role

  if (!USERNAME.test(login)) return res.status(400).json({ error: 'Username: 3 to 30 letters, numbers, dots, dashes or underscores.' })
  if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'Enter the full name.' })
  if (typeof newRole !== 'string' || !roleExists(newRole)) return res.status(400).json({ error: 'Choose a role.' })
  if (newRole !== user.role_id) {
    if (newRole === 'patient' || user.role_id === 'patient')
      return res.status(400).json({ error: 'A patient account cannot be changed into a staff account, or the other way round.' })
    if (user.id === req.user.id) return res.status(409).json({ error: "You can't change your own role." })
  }
  const settingPassword = typeof pw === 'string' && pw !== ''
  if (settingPassword) {
    const problem = checkPasswordRule(pw, login)
    if (problem) return res.status(400).json({ error: problem })
  }

  try {
    db.prepare('UPDATE users SET username = ?, name = ?, role_id = ? WHERE id = ?').run(login, fullName, newRole, user.id)
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That username is taken.' })
    throw err
  }
  if (settingPassword) {
    // A new password also unlocks the account and signs the user out everywhere.
    db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(await hashPassword(pw), user.id)
    if (user.id === req.user.id) endOtherSessions(user.id, req.sessionToken)
    else endAllSessions(user.id)
  }
  audit(req.user.username, settingPassword ? 'Updated user and reset password' : 'Updated user')
  res.json(shape(find(user.id)))
})

router.delete('/:id', (req, res) => {
  const user = find(req.params.id)
  if (!user) return res.status(404).json({ error: 'That user was not found.' })
  if (user.id === req.user.id) return res.status(409).json({ error: "You can't delete your own account." })
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
  audit(req.user.username, 'Deleted user')
  res.json({ ok: true })
})

export default router