import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

// Every kind of record the screens may ask for. A role that may not see one gets an empty list.
const EMPTY = {
  users: [], depts: [], patients: [], doctors: [], appts: [], records: [],
  labs: [], meds: [], adm: [], bills: [], staff: [], leaves: [], audit: [],
}

// Holds the records this user may see, loaded from the server.
// add / update / remove save to the server first, then update what is on screen.
export function DataProvider({ children }) {
  const { user } = useAuth()
  const [db, setDb] = useState(null)
  const [problem, setProblem] = useState('')

  const reload = useCallback(async () => {
    const data = await api.get('/bootstrap') // everything this role may see, in one request
    setDb({ ...EMPTY, ...data })
  }, [])

  // Load when someone signs in. Forget everything when they sign out.
  useEffect(() => {
    if (!user) { setDb(null); return }
    setProblem('')
    reload().catch((err) => setProblem(err.message))
  }, [user, reload])

  // When the browser tab is opened again, refresh, so other people's changes show up.
  useEffect(() => {
    if (!user) return
    const refresh = () => document.visibilityState === 'visible' && reload().catch(() => {})
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [user, reload])

  // Put a record the server sent back into the list (a new one is added, an old one is updated).
  const put = useCallback((coll, record) => {
    setDb((d) => {
      const exists = d[coll].some((r) => r.id === record.id)
      return {
        ...d,
        [coll]: exists ? d[coll].map((r) => (r.id === record.id ? { ...r, ...record } : r)) : [...d[coll], record],
      }
    })
  }, [])

  // These three throw an ApiError with the server's message when something is refused.
  const add = useCallback(async (coll, values) => {
    const saved = await api.post(`/${coll}`, values)
    put(coll, saved)
    return saved
  }, [put])

  const update = useCallback(async (coll, id, patch) => {
    const saved = await api.put(`/${coll}/${id}`, patch)
    put(coll, saved)
    return saved
  }, [put])

  const remove = useCallback(async (coll, id) => {
    await api.delete(`/${coll}/${id}`)
    setDb((d) => ({ ...d, [coll]: d[coll].filter((r) => r.id !== id) }))
  }, [])

  if (user && !db) {
    return (
      <div style={{ padding: 24 }}>
        <p>{problem || 'Loading…'}</p>
        {problem && <button onClick={() => reload().catch((err) => setProblem(err.message))}>Try again</button>}
      </div>
    )
  }

  return (
    <DataContext.Provider value={{ db: db ?? EMPTY, add, update, remove, put, reload }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)