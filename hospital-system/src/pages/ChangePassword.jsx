import { useState } from 'react'
import { api } from '../api'

// Any signed-in user can change their own password. The server checks the current one first,
// applies the strength rules, and signs out every other device.
export default function ChangePassword() {
  const [form, setForm] = useState({ current: '', next: '', again: '' })
  const [message, setMessage] = useState({ text: '', bad: false })
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.next !== form.again) return setMessage({ text: 'The two new passwords do not match.', bad: true })

    setBusy(true)
    try {
      await api.post('/auth/change-password', { currentPassword: form.current, newPassword: form.next })
      setForm({ current: '', next: '', again: '' })
      setMessage({ text: 'Your password was changed. Any other devices were signed out.', bad: false })
    } catch (err) {
      setMessage({ text: err.message, bad: true })
    }
    setBusy(false)
  }

  return (
    <>
      <header><h1>Change password</h1></header>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
        <label>Current password
          <input type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required />
        </label>
        <label>New password (8 or more characters, with a letter and a number)
          <input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} required />
        </label>
        <label>Repeat the new password
          <input type="password" autoComplete="new-password" value={form.again} onChange={set('again')} required />
        </label>
        {message.text && (
          <p role={message.bad ? 'alert' : 'status'} className={message.bad ? 'err' : 'mu'}>{message.text}</p>
        )}
        <div className="row"><button className="pri" disabled={busy}>Change password</button></div>
      </form>
    </>
  )
}