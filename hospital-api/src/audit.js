import { db } from './db.js'

// Add one line to the audit log: who did what. The server writes it, so users cannot edit it.
export function audit(username, action) {
  db.prepare('INSERT INTO audit_log (username, action) VALUES (?, ?)')
    .run(String(username).slice(0, 50), String(action).slice(0, 200))
}