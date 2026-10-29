import { useState } from 'react'
import { useData } from '../context/DataContext'
import { optionsOf } from '../utils'

// Builds a form from a module's field list. Used for both "Add" and "Edit".
// onSave may be async. If it throws, the message (usually from the server) is shown in the form.
export default function RecordForm({ module, record, onSave, onCancel }) {
  const { db } = useData()
  const [values, setValues] = useState(() => {
    const start = {}
    module.fields.forEach((f) => {
      const first = typeof f.default === 'function' ? f.default() : f.default
      // A secret field (a password) never shows the stored value.
      start[f.key] = f.secret ? '' : record?.[f.key] ?? first ?? ''
    })
    return start
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const clean = { ...values }
    module.fields.forEach((f) => {
      if (f.type === 'number' && clean[f.key] !== '') clean[f.key] = Number(clean[f.key])
    })
    // Optional quick check in the browser. The server checks everything again.
    const problem = module.validate ? await module.validate(clean, record, db) : ''
    if (problem) return setError(problem)

    setBusy(true)
    try {
      await onSave(clean)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="fg">
        {module.fields.map((f) => (
          <label key={f.key} className={f.type === 'textarea' ? 'wide' : undefined}>
            {f.label}
            {f.type === 'select' ? (
              <select value={values[f.key]} required={f.required} onChange={(e) => set(f.key, e.target.value)}>
                {!optionsOf(f, db).some(([v]) => v === '') && <option value="">Select…</option>}
                {optionsOf(f, db).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea rows="3" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input
                type={f.type || 'text'}
                min={f.type === 'number' ? 0 : undefined}
                step={f.type === 'number' ? 'any' : undefined}
                value={values[f.key]}
                required={f.required}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row">
        <button className="pri" type="submit" disabled={busy}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}