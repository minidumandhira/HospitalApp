import { now } from './utils'

// A second copy of all the data, kept under its own key in the browser.
const BACKUP_KEY = 'hms-react-backup'

// Returns { t: 'YYYY-MM-DD HH:mm', data: {...} } or null when there is no backup yet.
export function readBackup() {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY))
  } catch {
    return null
  }
}

// Returns true when the backup was saved, false when browser storage is full.
export function writeBackup(db) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ t: now(), data: db }))
    return true
  } catch {
    return false
  }
}