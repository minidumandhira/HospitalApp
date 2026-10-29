import { useState } from 'react'
import { useData } from '../context/DataContext'
import { today } from '../utils'

// Pharmacy queue: prescriptions written in Medical records, waiting to be dispensed.
export default function Prescriptions() {
  const { db, update } = useData()
  const [msg, setMsg] = useState({ text: '', bad: false })

  const say = (text, bad = false) => {
    setMsg({ text, bad })
    setTimeout(() => setMsg({ text: '', bad: false }), 4000)
  }

  const list = db.records.filter((r) => r.med).sort((a, b) => (a.date < b.date ? 1 : -1))
  const patientName = (id) => db.patients.find((p) => p.id === id)?.name ?? '—'

  const dispense = (r) => {
    const med = db.meds.find((m) => m.id === r.med)
    if (!med) return say('This medicine is no longer in the stock list.', true)
    if (med.expiry && med.expiry < today()) return say(`${med.name} has expired. Do not dispense it.`, true)
    if (Number(med.stock) < Number(r.qty)) return say(`Only ${med.stock} of ${med.name} in stock.`, true)

    update('meds', med.id, { stock: Number(med.stock) - Number(r.qty) }, 'Dispensed ' + med.name)
    // The cost is saved now, at today's price, so billing can use it later.
    update('records', r.id, { disp: today(), cost: Number(r.qty) * Number(med.price || 0) }, 'Prescription dispensed')
    say(`Dispensed ${r.qty} × ${med.name}.`)
  }

  return (
    <>
      <header><h1>Prescriptions</h1></header>

      {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'mu'}>{msg.text}</p>}

      {list.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr><th>Date</th><th>Patient</th><th>Medicine</th><th>Qty</th><th>Dosage</th><th>In stock</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const med = db.meds.find((m) => m.id === r.med)
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{patientName(r.patient)}</td>
                    <td>{med?.name ?? '—'}</td>
                    <td>{r.qty}</td>
                    <td>{r.dosage}</td>
                    <td>{med?.stock ?? '—'}</td>
                    <td className="ac">
                      {r.disp
                        ? <span className="b s-Completed">Dispensed {r.disp}</span>
                        : <button className="pri" onClick={() => dispense(r)}>Dispense</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No prescriptions yet. Doctors add them in Medical records.</p>
      )}
    </>
  )
}
