import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useData } from '../context/DataContext'
import RecordForm from '../components/RecordForm'
import Modal from '../components/Modal'

const rs = (n) => 'Rs ' + Number(n).toLocaleString()

// A table of invoice lines with a total row.
function ChargeTable({ items, total }) {
  return (
    <table>
      <tbody>
        {items.map((c) => (
          <tr key={c.source + c.id}><td>{c.text}</td><td className="ac">{rs(c.amount)}</td></tr>
        ))}
        <tr><td><b>Total</b></td><td className="ac"><b>{rs(total)}</b></td></tr>
      </tbody>
    </table>
  )
}

// A saved invoice, ready to print.
function Invoice({ bill, patientName }) {
  return (
    <>
      <p>{patientName} · {bill.date}</p>
      <ChargeTable items={bill.items} total={bill.total} />
      <p>
        Paid: {rs(bill.paid)}<br />
        Balance: <b>{rs(bill.balance)}</b>
      </p>
      {bill.pay.length > 0 && (
        <ul>
          {bill.pay.map((p, i) => <li key={i}>{p.d}: {rs(p.a)} by {p.m}</li>)}
        </ul>
      )}
    </>
  )
}

// The server works out every charge and every total. This page only asks and shows.
export default function Billing() {
  const { db, reload } = useData()
  const [bills, setBills] = useState(null)
  const [dialog, setDialog] = useState(null) // { type: 'generate' | 'pay' | 'invoice', bill? }
  const [patientId, setPatientId] = useState('') // chosen in the Generate bill dialog
  const [preview, setPreview] = useState(null)   // what the server says would be billed
  const [problem, setProblem] = useState('')     // a message from the server inside the dialog
  const [status, setStatus] = useState({ text: '', bad: false })

  const tell = (text, bad = false) => {
    setStatus({ text, bad })
    setTimeout(() => setStatus({ text: '', bad: false }), 4000)
  }
  const patientName = (id) => db.patients.find((p) => p.id === id)?.name ?? '—'
  const close = () => { setDialog(null); setPatientId(''); setPreview(null); setProblem('') }

  const load = useCallback(() => api.get('/bills').then(setBills).catch((err) => tell(err.message, true)), [])
  useEffect(() => { load() }, [load])

  const choosePatient = async (id) => {
    setPatientId(id)
    setPreview(null)
    setProblem('')
    if (!id) return
    try {
      setPreview(await api.get(`/bills/preview?patient=${id}`))
    } catch (err) {
      setProblem(err.message)
    }
  }

  const createInvoice = async () => {
    try {
      await api.post('/bills', { patient: patientId }) // only the patient is sent. The server decides the rest.
      close()
      tell('Invoice created.')
      await load()
      reload().catch(() => {}) // the charges are now marked as billed, so refresh what other pages show
    } catch (err) {
      setProblem(err.message)
    }
  }

  // The payment form. If the amount is too large, RecordForm shows the server's message.
  const paymentForm = (bill) => ({
    fields: [
      { key: 'amount', label: 'Amount (Rs)', type: 'number', required: true, default: bill.balance },
      { key: 'method', label: 'Method', type: 'select', options: ['Cash', 'Card', 'Bank transfer', 'Insurance'], default: 'Cash' },
    ],
  })

  const recordPayment = async (bill, values) => {
    await api.post(`/bills/${bill.id}/payments`, values)
    close()
    tell('Payment recorded.')
    await load()
  }

  return (
    <>
      <header>
        <h1>Billing</h1>
        <button className="pri" onClick={() => setDialog({ type: 'generate' })}>Generate bill</button>
      </header>

      {status.text && (
        <p role={status.bad ? 'alert' : 'status'} className={status.bad ? 'err' : 'mu'}>{status.text}</p>
      )}

      {bills === null ? (
        <p className="mu">Loading…</p>
      ) : bills.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Total</th><th>Paid</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{b.no}</td>
                  <td>{patientName(b.patient)}</td>
                  <td>{b.date}</td>
                  <td>{rs(b.total)}</td>
                  <td>{rs(b.paid)}</td>
                  <td><span className={'b s-' + b.status}>{b.status}</span></td>
                  <td className="ac">
                    <button onClick={() => setDialog({ type: 'invoice', bill: b })}>Invoice</button>
                    {b.balance > 0 && (
                      <button className="pri" onClick={() => setDialog({ type: 'pay', bill: b })}>Record payment</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No invoices yet. Complete a consultation, then use “Generate bill”.</p>
      )}

      {dialog?.type === 'generate' && (
        <Modal title="Generate bill" onClose={close}>
          <label>
            Patient
            <select value={patientId} onChange={(e) => choosePatient(e.target.value)}>
              <option value="">Select patient</option>
              {db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div style={{ margin: '12px 0' }}>
            {!patientId && <p className="mu">Choose a patient to see unbilled charges.</p>}
            {patientId && !preview && !problem && <p className="mu">Loading…</p>}
            {preview && !preview.items.length && (
              <p className="mu">
                No unbilled charges for this patient. Complete an appointment, lab test, dispensing or discharge first.
              </p>
            )}
            {preview?.items.length > 0 && <ChargeTable items={preview.items} total={preview.total} />}
            {problem && <p className="err" role="alert">{problem}</p>}
          </div>
          <div className="row">
            <button className="pri" disabled={!preview?.items.length} onClick={createInvoice}>Create invoice</button>
            <button onClick={close}>Cancel</button>
          </div>
        </Modal>
      )}

      {dialog?.type === 'pay' && (
        <Modal title={'Record payment for ' + dialog.bill.no} onClose={close}>
          <RecordForm
            module={paymentForm(dialog.bill)}
            record={null}
            onSave={(values) => recordPayment(dialog.bill, values)}
            onCancel={close}
          />
        </Modal>
      )}

      {dialog?.type === 'invoice' && (
        <Modal title={'Invoice ' + dialog.bill.no} onClose={close}>
          <Invoice bill={dialog.bill} patientName={patientName(dialog.bill.patient)} />
          <div className="row np">
            <button className="pri" onClick={() => window.print()}>Print invoice</button>
            <button onClick={close}>Close</button>
          </div>
        </Modal>
      )}
    </>
  )
}