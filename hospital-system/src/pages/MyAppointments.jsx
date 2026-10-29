import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { BOOKING } from '../config/portal'
import RecordForm from '../components/RecordForm'
import Modal from '../components/Modal'

// Patient portal: a patient sees, books and cancels only their own appointments.
// The server works out who the patient is from the session, so nobody can ask for someone else's.
export default function MyAppointments() {
  const [list, setList] = useState(null)
  const [booking, setBooking] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [status, setStatus] = useState({ text: '', bad: false })

  const tell = (text, bad = false) => {
    setStatus({ text, bad })
    setTimeout(() => setStatus({ text: '', bad: false }), 4000)
  }

  const load = useCallback(() => api.get('/my/appointments').then(setList).catch((err) => tell(err.message, true)), [])
  useEffect(() => { load() }, [load])

  // If the server refuses (the time is taken, or in the past), RecordForm shows its message.
  const book = async (values) => {
    await api.post('/my/appointments', values)
    setBooking(false)
    tell('Your appointment is booked.')
    await load()
  }

  const cancel = async () => {
    try {
      await api.post(`/my/appointments/${cancelling.id}/cancel`)
      tell('Your appointment was cancelled.')
    } catch (err) {
      tell(err.message, true)
    }
    setCancelling(null)
    await load()
  }

  return (
    <>
      <header>
        <h1>My appointments</h1>
        <button className="pri" onClick={() => setBooking(true)}>Book appointment</button>
      </header>

      {status.text && (
        <p role={status.bad ? 'alert' : 'status'} className={status.bad ? 'err' : 'mu'}>{status.text}</p>
      )}

      {list === null ? (
        <p className="mu">Loading…</p>
      ) : list.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr><th>Date and time</th><th>Doctor</th><th>Reason</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>{a.when.replace('T', ' ')}</td>
                  <td>{a.doctorName}<div className="mu">{a.dept}</div></td>
                  <td>{a.reason}</td>
                  <td><span className={'b s-' + a.status.replace(/\W/g, '')}>{a.status}</span></td>
                  <td className="ac">
                    {a.status === 'Scheduled' && (
                      <button className="dg" onClick={() => setCancelling(a)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">You have no appointments yet. Use “Book appointment” to make one.</p>
      )}

      {booking && (
        <Modal title="Book appointment" onClose={() => setBooking(false)}>
          <RecordForm module={BOOKING} record={null} onSave={book} onCancel={() => setBooking(false)} />
        </Modal>
      )}

      {cancelling && (
        <Modal title="Cancel this appointment?" onClose={() => setCancelling(null)}>
          <div className="row">
            <button className="pri" onClick={cancel}>Yes, cancel it</button>
            <button onClick={() => setCancelling(null)}>Keep it</button>
          </div>
        </Modal>
      )}
    </>
  )
}