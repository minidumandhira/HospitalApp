import { useEffect, useState } from 'react'
import { api } from '../api'
import { HistoryView } from '../components/PatientHistory'

// Patient portal: a patient's own medical history (read only). The server decides whose it is.
export default function MyRecord() {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/my/record').then(setHistory).catch((err) => setError(err.message))
  }, [])

  return (
    <>
      <header><h1>My health record</h1></header>
      {error && <p className="err" role="alert">{error}</p>}
      {!history && !error && <p className="mu">Loading…</p>}
      {history && (
        <>
          <h2>{history.patient.name}</h2>
          <HistoryView history={history} />
        </>
      )}
    </>
  )
}