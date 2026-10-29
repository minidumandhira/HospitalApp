import { createApp } from './app.js'
import { seedIfEmpty } from './seed.js'
import { purgeExpiredSessions } from './sessions.js'
import { ensureDailyBackup } from './backup.js'
import { PORT } from './config.js'

if (seedIfEmpty()) console.log('Empty database: added the starting data.')

purgeExpiredSessions()
setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref() // tidy up expired sessions every hour

// An automatic backup: one when the server starts, then a check every hour (it only acts once a day).
const backupToday = () => ensureDailyBackup().then((b) => b && console.log('Daily backup made:', b.name)).catch((e) => console.error('Backup failed:', e.message))
backupToday()
setInterval(backupToday, 60 * 60 * 1000).unref()

createApp().listen(PORT, () => console.log(`Hospital API running at http://localhost:${PORT}`))