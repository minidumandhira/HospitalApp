import { useEffect, useState } from 'react'
import { api } from '../api'

// Shows a history that the server sent (see /api/patients/:id/history and /api/my/record).
export function HistoryView({ history }) {
  const { patient, records, labs, appointments, stays } = history

  // A heading with a list, or "None recorded." when the list is empty.
  const section = (title, items) => (
    <>
      <h3>{title}</h3>
      {items.length ? <ul>{items}</ul> : <p className="mu">None recorded.</p>}
    </>
  )

  return (
    <>
      <p className="mu">
        {patient.gender} · born {patient.dob || 'unknown'} · blood group {patient.blood || 'unknown'} · allergies:{' '}
        {patient.allergies || 'none recorded'}
      </p>

      {section(
        'Diagnoses and treatment',
        records.map((r) => (
          <li key={r.id}>
            {r.date}: <b>{r.diagnosis}</b> ({r.doctorName})
            {r.treatment && <div className="mu">Treatment: {r.treatment}</div>}
            {r.medName && (
              <div className="mu">
                Medicine: {r.medName} × {r.qty}{r.dosage && ` (${r.dosage})`}{r.disp && ` · dispensed ${r.disp}`}
              </div>
            )}
            {r.prescription && <div className="mu">Prescription: {r.prescription}</div>}
            {r.report && <div className="mu">Report: {r.report}</div>}
          </li>
        )),
      )}
      {section(
        'Laboratory tests',
        labs.map((l) => (
          <li key={l.id}>
            {l.date}: <b>{l.test}</b> <span className={'b s-' + l.status.replace(/\W/g, '')}>{l.status}</span>
            {l.result && <div className="mu">Result: {l.result}</div>}
          </li>
        )),
      )}
      {section(
        'Appointments',
        appointments.map((a) => (
          <li key={a.id}>
            {a.when.replace('T', ' ')} with {a.doctorName}{' '}
            <span className={'b s-' + a.status.replace(/\W/g, '')}>{a.status}</span>
          </li>
        )),
      )}
      {section(
        'Hospital stays',
        stays.map((s) => (
          <li key={s.id}>
            {s.ad} to {s.out || 'present'}{s.ward && ` · ${s.ward}`}{s.bed && ` · bed ${s.bed}`}
          </li>
        )),
      )}
    </>
  )
}

// The staff view: loads one patient's history from the server.
export default function PatientHistory({ record: patient }) {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/patients/${patient.id}/history`).then(setHistory).catch((err) => setError(err.message))
  }, [patient.id])

  if (error) return <p className="err" role="alert">{error}</p>
  if (!history) return <p className="mu">Loading…</p>
  return <HistoryView history={history} />
}