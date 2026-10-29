import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler } from '../api'
import { ACCESS, COMMON_SCREENS, PORTAL_SCREENS } from '../config/roles'

const AuthContext = createContext(null)

// The server sends patientId. Some screens read user.patient, so both are provided.
const shape = (u) => ({ ...u, patient: u.patientId })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true) // true while we ask the server "am I already signed in?"
  const [notice, setNotice] = useState('')

  // When the page loads, the browser may already hold a valid session cookie.
  useEffect(() => {
    api.get('/auth/me')
      .then((r) => setUser(shape(r.user)))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  // If the server ever says "please sign in" (for example after 15 idle minutes), go back to sign-in.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setNotice('Your session has ended. Please sign in again.')
    })
  }, [])

  // login and register return an error message, or '' when it worked.
  const login = useCallback(async (username, password) => {
    try {
      const r = await api.post('/auth/login', { username, password })
      setNotice('')
      setUser(shape(r.user))
      return ''
    } catch (err) {
      return err.message
    }
  }, [])

  const register = useCallback(async (details) => {
    try {
      const r = await api.post('/auth/register', details)
      setNotice('')
      setUser(shape(r.user))
      return ''
    } catch (err) {
      return err.message
    }
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch { /* the screen signs out either way */ }
    setUser(null)
    setNotice('')
  }, [])

  // Which menu items to show. The real protection is on the server.
  const can = (key) => {
    if (!user) return false
    if (COMMON_SCREENS.includes(key)) return true
    if (PORTAL_SCREENS.includes(key)) return user.role === 'patient'
    const allowed = ACCESS[user.role]
    return allowed === 'all' || allowed.includes(key)
  }

  if (checking) return <p style={{ padding: 24 }}>Loading…</p>

  return (
    <AuthContext.Provider value={{ user, login, register, logout, can, notice }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)