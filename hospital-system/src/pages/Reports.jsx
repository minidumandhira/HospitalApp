import { useEffect, useState } from 'react'
import { api } from '../api'

// The server builds the reports and sends each role only the ones it may see
// (doctors get clinical reports, accountants get money reports, the administrator gets all).
export default function Reports() {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports').then(setReports).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="err" role="alert">{error}</p>
  if (!reports) return <p className="mu">Loading…</p>

  return (
    <div className="report">
      <header>
        <h1>Reports</h1>
        <button className="np" onClick={() => window.print()}>Print</button>
      </header>

      {reports.map((r) => (
        <section key={r.title}>
          <h3>{r.title}</h3>
          {r.rows.length ? (
            <div className="tw">
              <table>
                <thead>
                  <tr>{r.head.map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mu">No data yet.</p>
          )}
        </section>
      ))}
    </div>
  )
}