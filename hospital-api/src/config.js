import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// Where the database file lives. Tests set DB_FILE to use a throw-away database.
export const DB_FILE = process.env.DB_FILE || path.join(here, '..', 'data', 'hospital.db')

// Where backup copies of the database are kept, and how many daily backups to keep.
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_FILE), 'backups')
export const BACKUPS_KEPT = 14

export const PORT = Number(process.env.PORT) || 4000


export const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173'

// True when the server runs for real users (over HTTPS), not on your own computer.
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// ----- Sign-in and sessions -----
export const COOKIE_NAME = 'hms_session'
export const SESSION_IDLE_MS = 15 * 60 * 1000       
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000    
export const MAX_FAILED_LOGINS = 5                  
export const LOCK_MS = 15 * 60 * 1000               