import { useState } from 'react'
import { useData } from '../context/DataContext'
import { today } from '../utils'
import { paidOf, balanceOf, billStatus, unbilledCharges, rs } from '../config/billing'
import RecordForm from '../components/RecordForm'
import Modal from '../components/Modal'

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
        Paid: {rs(paidOf(bill))}<br />
        Balance: <b>{rs(balanceOf(bill))}</b>
      </p>
      {bill.pay.length > 0 && (
        <ul>
          {bill.pay.map((p, i) => <li key={i}>{p.d}: {rs(p.a)} by {p.m}</li>)}
        </ul>
      )}
    </>
  )
}

export default function Billing() {
  const { db, add, update } = useData()
  const [dialog, setDialog] = useState(null) // { type: 'generate' | 'pay' | 'invoice', bill? }
  const [patientId, setPatientId] = useState('') // chosen in the Generate bill dialog
  const [status, setStatus] = useState('')

  const tell = (msg) => { setStatus(msg); setTimeout(() => setStatus(''), 3000) }
  const patientName = (id) => db.patients.find((p) => p.id === id)?.name ?? '—'
  const close = () => { setDialog(null); setPatientId('') }

  const charges = patientId ? unbilledCharges(db, patientId) : []
  const total = charges.reduce((sum, c) => sum + c.amount, 0)

  const createInvoice = () => {
    // Next number = highest existing number + 1, so numbers never repeat.
    const last = Math.max(0, ...db.bills.map((b) => Number(b.no.slice(4))))
    add('bills', {
      no: 'INV-' + String(last + 1).padStart(4, '0'),
      patient: patientId,
      date: today(),
      items: charges,
      total,
      pay: [],
    }, 'Invoice generated')
    // Mark each charge as billed so it can never be charged twice.
    charges.forEach((c) => update(c.source, c.id, { billed: true }, 'Charge billed'))
    close()
    tell('Invoice created.')
  }

  const recordPayment = (bill, values) => {
    update('bills', bill.id, { pay: [...bill.pay, { d: today(), a: values.amount, m: values.method }] },
      'Payment recorded for ' + bill.no)
    close()
    tell('Payment recorded.')
  }

  // The payment form: amount starts as the full balance and cannot be more than it.
  const paymentForm = (bill) => ({
    fields: [
      { key: 'amount', label: 'Amount (Rs)', type: 'number', required: true, default: balanceOf(bill) },
      { key: 'method', label: 'Method', type: 'select', options: ['Cash', 'Card', 'Bank transfer', 'Insurance'], default: 'Cash' },
    ],
    validate: (v) =>
      v.amount > 0 && v.amount <= balanceOf(bill) ? '' : `Enter an amount up to ${rs(balanceOf(bill))}.`,
  })

  return (
    <>
      <header>
        <h1>Billing</h1>
        <button className="pri" onClick={() => setDialog({ type: 'generate' })}>Generate bill</button>
      </header>

      {status && <p role="status" className="mu">{status}</p>}

      {db.bills.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Total</th><th>Paid</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {db.bills.slice().reverse().map((b) => (
                <tr key={b.id}>
                  <td>{b.no}</td>
                  <td>{patientName(b.patient)}</td>
                  <td>{b.date}</td>
                  <td>{rs(b.total)}</td>
                  <td>{rs(paidOf(b))}</td>
                  <td><span className={'b s-' + billStatus(b)}>{billStatus(b)}</span></td>
                  <td className="ac">
                    <button onClick={() => setDialog({ type: 'invoice', bill: b })}>Invoice</button>
                    {balanceOf(b) > 0 && (
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
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Select patient</option>
              {db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div style={{ margin: '12px 0' }}>
            {!patientId && <p className="mu">Choose a patient to see unbilled charges.</p>}
            {patientId && !charges.length && (
              <p className="mu">
                No unbilled charges for this patient. Complete an appointment, lab test, dispensing or discharge first.
              </p>
            )}
            {charges.length > 0 && <ChargeTable items={charges} total={total} />}
          </div>
          <div className="row">
            <button className="pri" disabled={!charges.length} onClick={createInvoice}>Create invoice</button>
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