import { useState } from 'react'
import { useData } from '../context/DataContext'
import { readBackup, writeBackup } from '../backup'
import Modal from '../components/Modal'

// Administrator page: backup and restore, plus the audit trail of who did what.
export default function Audit() {
  const { db, restore } = useData()
  const [backup, setBackup] = useState(readBackup)
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState({ text: '', bad: false })

  const say = (text, bad = false) => {
    setStatus({ text, bad })
    setTimeout(() => setStatus({ text: '', bad: false }), 4000)
  }

  const backUpNow = () => {
    const ok = writeBackup(db)
    setBackup(readBackup())
    if (ok) say('Backup saved.')
    else say('Backup failed: browser storage is full.', true)
  }

  const restoreNow = () => {
    restore(backup.data)
    setConfirming(false)
    say('Backup restored.')
  }

  return (
    <>
      <header><h1>Audit log and backup</h1></header>

      <p>
        Last backup: <b>{backup ? backup.t : 'none yet'}</b>. A backup is also made automatically
        the first time the system is used each day.
      </p>
      <div className="row">
        <button className="pri" onClick={backUpNow}>Back up now</button>
        <button disabled={!backup} onClick={() => setConfirming(true)}>Restore last backup</button>
      </div>
      {status.text && <p role={status.bad ? 'alert' : 'status'} className={status.bad ? 'err' : 'mu'}>{status.text}</p>}

      <h3>Audit log</h3>
      {db.audit.length ? (
        <div className="tw">
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Action</th></tr></thead>
            <tbody>
              {db.audit.map((a, i) => (
                <tr key={i}><td>{a.t}</td><td>{a.u}</td><td>{a.a}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No activity yet.</p>
      )}

      {confirming && (
        <Modal title="Replace all current data with the last backup?" onClose={() => setConfirming(false)}>
          <p className="mu">Changes made after {backup.t} will be lost.</p>
          <div className="row">
            <button className="pri" onClick={restoreNow}>Restore</button>
            <button onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}