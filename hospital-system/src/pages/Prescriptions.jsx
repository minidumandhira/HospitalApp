import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useData } from '../context/DataContext'

// The pharmacy queue. The server sends the prescription and the stock, but never the diagnosis.
// Dispensing is done by the server in one step: check the stock, take it out, note the cost.
export default function Prescriptions() {
  const { reload } = useData()
  const [list, setList] = useState(null)
  const [msg, setMsg] = useState({ text: '', bad: false })

  const say = (text, bad = false) => {
    setMsg({ text, bad })
    setTimeout(() => setMsg({ text: '', bad: false }), 4000)
  }

  const load = useCallback(() => api.get('/prescriptions').then(setList).catch((err) => say(err.message, true)), [])
  useEffect(() => { load() }, [load])

  const dispense = async (rx) => {
    try {
      const done = await api.post(`/prescriptions/${rx.id}/dispense`)
      setList((l) => l.map((r) => (r.id === done.id ? done : r)))
      say(`Dispensed ${done.qty} × ${done.medName}.`)
      reload().catch(() => {}) // the stock changed, so refresh the Pharmacy stock page
    } catch (err) {
      say(err.message, true)
      load() // the stock shown may be out of date, so show the latest
    }
  }

  return (
    <>
      <header><h1>Prescriptions</h1></header>

      {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'mu'}>{msg.text}</p>}

      {list === null ? (
        <p className="mu">Loading…</p>
      ) : list.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr><th>Date</th><th>Patient</th><th>Medicine</th><th>Qty</th><th>Dosage</th><th>In stock</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.patientName}</td>
                  <td>{r.medName}</td>
                  <td>{r.qty}</td>
                  <td>{r.dosage}</td>
                  <td>{r.stock}</td>
                  <td className="ac">
                    {r.disp
                      ? <span className="b s-Completed">Dispensed {r.disp}</span>
                      : <button className="pri" onClick={() => dispense(r)}>Dispense</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No prescriptions yet. Doctors add them in Medical records.</p>
      )}
    </>
  )
}