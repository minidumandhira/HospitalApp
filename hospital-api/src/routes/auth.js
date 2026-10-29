import { Router } from 'express'
import { db, newId } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth } from '../auth.js'
import { COOKIE_NAME, LOCK_MS, MAX_FAILED_LOGINS } from '../config.js'
import { checkPasswordRule, DUMMY_HASH, hashPassword, verifyPassword } from '../passwords.js'
import { clearOptions, cookieOptions, createSession, endAllSessions, endOtherSessions, endSession, findSession } from '../sessions.js'

const router = Router()

// Count a wrong password. Returns true when this one locked the account.
function registerFailure(userId) {
  const { failed_attempts } = db.prepare('SELECT failed_attempts FROM users WHERE id = ?').get(userId)
  const attempts = failed_attempts + 1
  if (attempts >= MAX_FAILED_LOGINS) {
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?')
      .run(new Date(Date.now() + LOCK_MS).toISOString(), userId)
    return true
  }
  db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, userId)
  return false
}

const lockedMessage = (until) =>
  `Too many failed attempts. Try again in ${Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60000))} minute(s).`

// Start a session and send the cookie.
function signIn(res, user) {
  res.cookie(COOKIE_NAME, createSession(user.id), cookieOptions())
}

// ----- Sign in -----
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {}
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password ||
      username.length > 50 || password.length > 200) {
    return res.status(400).json({ error: 'Enter your username and password.' })
  }

  const name = username.trim().toLowerCase()
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(name)

  if (user?.locked_until && Date.parse(user.locked_until) > Date.now()) {
    audit(name, 'Sign-in refused: account is locked')
    return res.status(429).json({ error: lockedMessage(user.locked_until) })
  }

  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH)
  if (!user || !ok) {
    const locked = user ? registerFailure(user.id) : false
    audit(name, locked ? 'Failed sign-in: account locked' : 'Failed sign-in')
    if (locked) return res.status(429).json({ error: lockedMessage(new Date(Date.now() + LOCK_MS).toISOString()) })
    // The same message for a wrong username and a wrong password, so it reveals nothing.
    return res.status(401).json({ error: 'Username or password is incorrect.' })
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id)
  signIn(res, user)
  audit(user.username, 'Signed in')
  res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role_id, patientId: user.patient_id } })
})

// ----- Who am I? The React app calls this when the page loads. -----
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))

// ----- Sign out -----
router.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME]
  if (token) {
    const user = findSession(token)
    if (user) audit(user.username, 'Signed out')
    endSession(token)
  }
  res.clearCookie(COOKIE_NAME, clearOptions)
  res.json({ ok: true })
})

// ----- Change my own password -----
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {}
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Enter your current password and a new one.' })
  }

  const { password_hash } = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id)
  if (!(await verifyPassword(currentPassword, password_hash))) {
    // Someone with a stolen session could guess here, so wrong guesses count towards the lock too.
    if (registerFailure(req.user.id)) {
      endAllSessions(req.user.id)
      audit(req.user.username, 'Wrong current password too many times: account locked')
      return res.status(429).json({ error: 'Too many failed attempts. The account is locked for a while.' })
    }
    audit(req.user.username, 'Password change refused: wrong current password')
    return res.status(400).json({ error: 'Your current password is incorrect.' })
  }

  if (newPassword === currentPassword) return res.status(400).json({ error: 'Choose a password you are not already using.' })
  const problem = checkPasswordRule(newPassword, req.user.username)
  if (problem) return res.status(400).json({ error: problem })

  db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0 WHERE id = ?')
    .run(await hashPassword(newPassword), req.user.id)
  endOtherSessions(req.user.id, req.sessionToken) // anyone else signed in as this user is signed out
  audit(req.user.username, 'Password changed')
  res.json({ ok: true })
})

// ----- A patient creates their own account -----
router.post('/register', async (req, res) => {
  const { name, dob, phone, username, password } = req.body ?? {}
  const text = (v) => (typeof v === 'string' ? v.trim() : '')
  const login = text(username).toLowerCase()

  if (text(name).length < 2 || text(name).length > 100) return res.status(400).json({ error: 'Enter your full name.' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(dob)) || Number.isNaN(Date.parse(dob)) || dob > new Date().toISOString().slice(0, 10))
    return res.status(400).json({ error: 'Enter a valid date of birth.' })
  if (!/^[0-9+\-\s]{7,20}$/.test(text(phone))) return res.status(400).json({ error: 'Enter a valid phone number.' })
  if (!/^[a-z0-9._-]{3,30}$/.test(login))
    return res.status(400).json({ error: 'Username: 3 to 30 letters, numbers, dots, dashes or underscores.' })
  const problem = checkPasswordRule(password, login)
  if (problem) return res.status(400).json({ error: problem })

  const patientId = newId()
  const user = { id: newId(), username: login, name: text(name), role: 'patient', patientId }
  const password_hash = await hashPassword(password)
  try {
    // Both rows are saved, or neither is.
    db.transaction(() => {
      db.prepare('INSERT INTO patients (id, name, dob, phone) VALUES (?, ?, ?, ?)').run(patientId, user.name, text(dob), text(phone))
      db.prepare('INSERT INTO users (id, username, name, role_id, password_hash, patient_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, user.username, user.name, 'patient', password_hash, patientId)
    })()
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That username is taken. Choose another.' })
    throw err
  }

  signIn(res, user)
  audit(user.username, 'Patient account created')
  res.status(201).json({ user })
})

export default router