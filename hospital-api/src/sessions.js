import crypto from 'node:crypto'
import { db } from './db.js'
import { IS_PRODUCTION, SESSION_IDLE_MS, SESSION_MAX_MS } from './config.js'

// The token goes to the browser. The database keeps only its hash. A fast hash is fine here
// because the token is 256 random bits, which cannot be guessed (unlike a human password).
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

// The cookie that carries the token. httpOnly means page scripts cannot read it.
export const clearOptions = { httpOnly: true, sameSite: 'lax', secure: IS_PRODUCTION, path: '/' }
export const cookieOptions = () => ({ ...clearOptions, maxAge: SESSION_MAX_MS })

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now, now)
  return token
}

// Returns the signed-in user for a token, or null if there is no valid session.
// Each valid use renews the idle timer.
export function findSession(token) {
  const hash = hashToken(token)
  const row = db.prepare(
    `SELECT s.created_at, s.last_seen, u.id, u.username, u.name, u.role_id AS role, u.patient_id AS patientId
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`).get(hash)
  if (!row) return null

  const now = Date.now()
  if (now - row.last_seen > SESSION_IDLE_MS || now - row.created_at > SESSION_MAX_MS) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash)
    return null
  }
  db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(now, hash)
  const { created_at, last_seen, ...user } = row
  return user
}

export const endSession = (token) =>
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))

// After a password change: sign the account out everywhere except the browser that changed it.
export const endOtherSessions = (userId, keepToken) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, hashToken(keepToken))

export const endAllSessions = (userId) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)

// Remove sessions that have run out. Called when the server starts and then every hour.
export function purgeExpiredSessions() {
  const now = Date.now()
  db.prepare('DELETE FROM sessions WHERE last_seen < ? OR created_at < ?')
    .run(now - SESSION_IDLE_MS, now - SESSION_MAX_MS)
}