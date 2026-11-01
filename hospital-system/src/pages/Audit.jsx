import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useData } from '../context/DataContext'
import Modal from '../components/Modal'

// Administrator page: backups kept by the server, and the audit trail of who did what.
// Backups are made automatically once a day on the server. The audit log can only grow.
export default function Audit() {
  const { reload } = useData()
  const [backups, setBackups] = useState(null)
  const [entries, setEntries] = useState(null)
  const [next, setNext] = useState(null)       // the id to continue from, or null at the end
  const [restoring, setRestoring] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState({ text: '', bad: false })

  const say = (text, bad = false) => {
    setStatus({ text, bad })
    setTimeout(() => setStatus({ text: '', bad: false }), 6000)
  }

  const loadBackups = useCallback(() => api.get('/backups').then(setBackups).catch((err) => say(err.message, true)), [])

  // The newest entries first. Pass `before` to add the next, older page.
  const loadEntries = useCallback(async (before) => {
    try {
      const page = await api.get('/audit?limit=50' + (before ? `&before=${before}` : ''))
      setEntries((old) => (before ? [...old, ...page.entries] : page.entries))
      setNext(page.next)
    } catch (err) {
      say(err.message, true)
    }
  }, [])

  useEffect(() => { loadBackups(); loadEntries() }, [loadBackups, loadEntries])

  const backUpNow = async () => {
    setBusy(true)
    try {
      await api.post('/backups')
      say('Backup saved.')
      await Promise.all([loadBackups(), loadEntries()])
    } catch (err) {
      say(err.message, true)
    }
    setBusy(false)
  }

  const restore = async () => {
    setBusy(true)
    try {
      const done = await api.post(`/backups/${restoring.name}/restore`)
      say(`Backup restored. A safety copy of the earlier data was saved as ${done.safetyCopy}.`)
      await Promise.all([reload(), loadBackups(), loadEntries()]) // the data changed, so load it again
    } catch (err) {
      say(err.message, true)
    }
    setRestoring(null)
    setBusy(false)
  }

  return (
    <>
      <header><h1>Audit log and backup</h1></header>

      <p>
        The server makes a backup automatically once a day and keeps the latest 14.
        You can also make one now. Backups are stored on the server's own computer.
      </p>
      <div className="row">
        <button className="pri" disabled={busy} onClick={backUpNow}>Back up now</button>
      </div>
      {status.text && <p role={status.bad ? 'alert' : 'status'} className={status.bad ? 'err' : 'mu'}>{status.text}</p>}

      <h3>Backups</h3>
      {backups === null ? (
        <p className="mu">Loading…</p>
      ) : backups.length ? (
        <div className="tw">
          <table>
            <thead><tr><th>File</th><th>Made on</th><th>Size</th><th>Kind</th><th /></tr></thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td>{b.created}</td>
                  <td>{Math.max(1, Math.round(b.size / 1024))} KB</td>
                  <td>{b.safety ? 'Safety copy before a restore' : 'Backup'}</td>
                  <td className="ac"><button disabled={busy} onClick={() => setRestoring(b)}>Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No backups yet.</p>
      )}

      <h3>Audit log</h3>
      {entries === null ? (
        <p className="mu">Loading…</p>
      ) : entries.length ? (
        <>
          <div className="tw">
            <table>
              <thead><tr><th>Time</th><th>User</th><th>Action</th></tr></thead>
              <tbody>
                {entries.map((a) => (
                  <tr key={a.id}><td>{a.t}</td><td>{a.u}</td><td>{a.a}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {next && (
            <div className="row" style={{ marginTop: 12 }}>
              <button onClick={() => loadEntries(next)}>Load more</button>
            </div>
          )}
        </>
      ) : (
        <p className="empty">No activity yet.</p>
      )}

      {restoring && (
        <Modal title="Replace all current data with this backup?" onClose={() => setRestoring(null)}>
          <p className="mu">
            Everything changed after {restoring.created} will be lost. A safety copy of the current data
            is saved first. The audit log is kept.
          </p>
          <div className="row">
            <button className="pri" disabled={busy} onClick={restore}>Restore</button>
            <button onClick={() => setRestoring(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}