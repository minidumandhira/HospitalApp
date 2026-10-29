import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DB_FILE } from './config.js'

// Open (or create) the database file.
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
export const db = new Database(DB_FILE)

db.pragma('journal_mode = WAL')   // safer, faster writes
db.pragma('foreign_keys = ON')    // make the database enforce the links between tables

// Create any missing tables from schema.sql. Existing tables and data are left alone.
const here = path.dirname(fileURLToPath(import.meta.url))
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'))

// A new random id for a row.
export const newId = () => crypto.randomUUID()