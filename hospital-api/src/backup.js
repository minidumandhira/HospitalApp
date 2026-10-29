import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import { BACKUP_DIR, BACKUPS_KEPT } from './config.js'
import { Problem } from './errors.js'

// Backup files are named hospital-20261029-101530.db (date and time).
// A copy made automatically just before a restore ends in -before-restore.
const NAME = /^hospital-(\d{8})-\d{6}(?:-\d+)?(-before-restore)?\.db$/
const SAFETY_KEPT = 5

// These tables are replaced by a restore. The audit log and the sessions are not:
// the audit log must only ever grow, and restoring old sessions would sign old logins back in.
// Parents come before the tables that point at them.
const RESTORED = [
  'roles', 'departments', 'patients', 'users', 'doctors', 'medicines', 'appointments', 'admissions',
  'medical_records', 'lab_tests', 'invoices', 'invoice_items', 'payments', 'employees', 'attendance', 'leave_requests',
]

const localIso = (ms) => new Date(ms - new Date().getTimezoneOffset() * 6e4).toISOString()
const stamp = () => localIso(Date.now()).slice(0, 19).replace(/[-:]/g, '').replace('T', '-')

function newName(safety) {
  const base = `hospital-${stamp()}`
  for (let n = 1; ; n++) {
    const name = `${base}${n > 1 ? '-' + n : ''}${safety ? '-before-restore' : ''}.db`
    if (!fs.existsSync(path.join(BACKUP_DIR, name))) return name
  }
}

function describe(name) {
  const stats = fs.statSync(path.join(BACKUP_DIR, name))
  return { name, size: stats.size, created: localIso(stats.mtimeMs).slice(0, 16).replace('T', ' '), safety: name.includes('-before-restore'), ms: stats.mtimeMs }
}

// All backups, newest first.
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs.readdirSync(BACKUP_DIR).filter((n) => NAME.test(n)).map(describe).sort((a, b) => b.ms - a.ms)
}

// Delete the oldest copies so the folder does not grow forever.
function prune() {
  const all = listBackups()
  for (const [safety, keep] of [[false, BACKUPS_KEPT], [true, SAFETY_KEPT]]) {
    all.filter((b) => b.safety === safety).slice(keep).forEach((b) => fs.rmSync(path.join(BACKUP_DIR, b.name), { force: true }))
  }
}

// Make a copy of the whole database. SQLite's own backup is safe while the server is in use.
export async function createBackup({ safety = false } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const name = newName(safety)
  await db.backup(path.join(BACKUP_DIR, name))
  prune()
  const { ms, ...info } = describe(name)
  return info
}

// The automatic backup: make one if there is none yet today.
export async function ensureDailyBackup() {
  const today = stamp().slice(0, 8)
  const done = listBackups().some((b) => !b.safety && b.name.startsWith(`hospital-${today}-`))
  return done ? null : createBackup()
}

// Replace the live data with a backup. First a safety copy of the current data is made, so even a
// restore can be undone. The swap is one transaction: it all happens, or none of it does.
export async function restoreBackup(name) {
  if (!NAME.test(name)) throw new Problem(400, 'That is not a valid backup name.')   // also blocks ../ tricks
  const file = path.join(BACKUP_DIR, name)
  if (!fs.existsSync(file)) throw new Problem(404, 'That backup was not found.')

  const safetyCopy = await createBackup({ safety: true })

  db.pragma('foreign_keys = OFF')          // rows are deleted and re-added, so links are checked at the end instead
  db.prepare('ATTACH DATABASE ? AS old').run(file)
  try {
    db.transaction(() => {
      const present = new Set(db.prepare("SELECT name FROM old.sqlite_master WHERE type = 'table'").all().map((r) => r.name))
      if (RESTORED.some((t) => !present.has(t))) throw new Problem(400, 'This backup is from a different version and cannot be restored.')

      for (const table of [...RESTORED].reverse()) db.exec(`DELETE FROM main.${table}`)
      for (const table of RESTORED) {
        const oldColumns = new Set(db.prepare(`PRAGMA old.table_info(${table})`).all().map((c) => c.name))
        const columns = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name).filter((c) => oldColumns.has(c)).join(', ')
        db.exec(`INSERT INTO main.${table} (${columns}) SELECT ${columns} FROM old.${table}`)
      }
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Problem(400, 'This backup is damaged and was not restored.')
      db.exec('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)')   // logins that no longer exist
    })()
  } finally {
    db.exec('DETACH DATABASE old')
    db.pragma('foreign_keys = ON')
  }
  return { restored: name, safetyCopy: safetyCopy.name }
}