import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { WEB_ORIGIN } from './config.js'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import actionsRouter from './routes/actions.js'
import pharmacyRouter from './routes/pharmacy.js'
import billingRouter from './routes/billing.js'
import portalRouter from './routes/portal.js'
import historyRouter from './routes/history.js'
import reportsRouter from './routes/reports.js'
import adminRouter from './routes/admin.js'
import bootstrapRouter from './routes/bootstrap.js'
import resourcesRouter from './routes/resources.js'
import { Problem } from './errors.js'

// Builds the web application. server.js starts it; the tests start their own copy.
export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: WEB_ORIGIN, credentials: true })) // only the React app may call this API
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  app.get('/', (req, res) => res.send('Hospital API is running. Try /api/health'))
  app.get('/api/health', (req, res) => res.json({ ok: true }))

  app.use('/api/auth', authRouter)
  app.use('/api/users', usersRouter)
  app.use('/api', actionsRouter)
  app.use('/api', pharmacyRouter)    // the prescription queue and dispensing
  app.use('/api', billingRouter)     // invoices and payments
  app.use('/api', portalRouter)      // a patient's own appointments
  app.use('/api', historyRouter)     // medical history
  app.use('/api', reportsRouter)     // reports and the dashboard numbers
  app.use('/api', adminRouter)       // the audit log and backups
  app.use('/api', bootstrapRouter)   // everything this role may see, in one request
  app.use('/api', resourcesRouter)   // patients, appointments, lab, pharmacy ... (see resources.js)

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))

  // Any error ends up here. Details go to the server log, never to the user.
  app.use((err, req, res, next) => {
    if (err instanceof Problem) return res.status(err.status).json({ error: err.message }) // a clear, planned answer
    const status = err.status && err.status < 500 ? err.status : 500
    if (status === 500) console.error(err)
    res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : 'The request could not be read.' })
  })

  return app
}