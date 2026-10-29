import fs from 'node:fs'
import { DB_FILE } from './config.js'

// Delete the database files, then build a fresh one with the starting data.
// The database is only opened after the old files are gone, so this import comes last.
for (const file of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(file, { force: true })

const { seedIfEmpty } = await import('./seed.js')
seedIfEmpty()
console.log('Database reset with the starting data:', DB_FILE)