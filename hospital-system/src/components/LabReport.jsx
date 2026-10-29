import { useData } from '../context/DataContext'

// Printable laboratory report for one finished test.
export default function LabReport({ record: test }) {
  const { db } = useData()
  const patient = db.patients.find((p) => p.id === test.patient)
  const doctor = db.doctors.find((d) => d.id === test.doctor)

  return (
    <>
      <p>
        <b>{patient?.name ?? '—'}</b>
        {patient?.dob && <span className="mu"> · born {patient.dob}</span>}
      </p>
      <p className="mu">
        Requested {test.date}{doctor && ` by ${doctor.name}`}
      </p>
      <h3>{test.test}</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{test.result}</p>
      <div className="row np">
        <button className="pri" onClick={() => window.print()}>Print report</button>
      </div>
    </>
  )
}
