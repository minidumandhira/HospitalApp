import { COOKIE_NAME } from './config.js'
import { clearOptions, findSession } from './sessions.js'

// Use on any route that needs a signed-in user. Adds req.user and req.sessionToken.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  const user = token ? findSession(token) : null
  if (!user) {
    if (token) res.clearCookie(COOKIE_NAME, clearOptions) // the old cookie is useless, so remove it
    return res.status(401).json({ error: 'Please sign in.' })
  }
  req.user = user
  req.sessionToken = token
  next()
}

// Use after requireAuth to limit a route to some roles: requireRole('admin', 'acct')
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: 'You do not have permission to do that.' })