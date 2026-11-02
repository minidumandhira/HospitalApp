
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WEB_ORIGIN, IS_PRODUCTION } from './config.js'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const frontendPath = path.resolve(
  __dirname,
  '../../hospital-system/dist'
)

export function createApp() {
  const app = express()

  app.disable('x-powered-by')

  // Render runs behind a proxy.
  if (IS_PRODUCTION) {
    app.set('trust proxy', 1)
  }

 const allowedOrigins = [
  WEB_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))

  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  // Prevent caching private API responses.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.get('/api/health', (req, res) => {
    res.json({ ok: true })
  })

  // Existing API routes.
  app.use('/api/auth', authRouter)
  app.use('/api/users', usersRouter)
  app.use('/api', actionsRouter)
  app.use('/api', pharmacyRouter)
  app.use('/api', billingRouter)
  app.use('/api', portalRouter)
  app.use('/api', historyRouter)
  app.use('/api', reportsRouter)
  app.use('/api', adminRouter)
  app.use('/api', bootstrapRouter)
  app.use('/api', resourcesRouter)

  // API 404 handler.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found.' })
  })

  // Serve React production build.
  app.use(express.static(frontendPath))

  // React Router fallback.
  app.get(/.*/, (req, res, next) => {
    res.sendFile(
      path.join(frontendPath, 'index.html'),
      (err) => {
        if (err) next(err)
      }
    )
  })

  // Existing error handler.
  app.use((err, req, res, next) => {
    if (err instanceof Problem) {
      return res.status(err.status).json({ error: err.message })
    }

    const status = err.status && err.status < 500 ? err.status : 500

    if (status === 500) console.error(err)

    res.status(status).json({
      error: status === 500
        ? 'Something went wrong on the server.'
        : 'The request could not be read.'
    })
  })

  return app
}
