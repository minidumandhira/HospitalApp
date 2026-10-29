import { useData } from '../context/DataContext'
import { today } from '../utils'
import { paidOf, balanceOf, rs } from '../config/billing'

// Counts items by a label, e.g. patients by gender -> [['Female', 3], ['Male', 2]].
const countBy = (list, pick) => {
  const counts = {}
  list.forEach((item) => {
    const key = pick(item) || '—'
    counts[key] = (counts[key] || 0) + 1
  })
  return Object.entries(counts)
}

export default function Reports() {
  const { db } = useData()
  const month = today().slice(0, 7)
  const patientName = (id) => db.patients.find((p) => p.id === id)?.name ?? '—'

  const revenueByMonth = {}
  db.bills.forEach((b) => {
    const m = b.date.slice(0, 7)
    revenueByMonth[m] = (revenueByMonth[m] || 0) + paidOf(b)
  })

  // Each report: a title, column headings and rows. The page draws them all the same way.
  const reports = [
    { title: 'Patient report: patients by gender', head: ['Gender', 'Patients'], rows: countBy(db.patients, (p) => p.gender) },
    { title: 'Appointment report: by status', head: ['Status', 'Appointments'], rows: countBy(db.appts, (a) => a.status) },
    {
      title: 'Revenue report: collected by month',
      head: ['Month', 'Collected'],
      rows: Object.entries(revenueByMonth).sort().map(([m, v]) => [m, rs(v)]),
    },
    {
      title: 'Outstanding invoices',
      head: ['Invoice', 'Patient', 'Balance'],
      rows: db.bills.filter((b) => balanceOf(b) > 0).map((b) => [b.no, patientName(b.patient), rs(balanceOf(b))]),
    },
    {
      title: 'Pharmacy report: stock value',
      head: ['Medicine', 'Stock', 'Value'],
      rows: db.meds.map((m) => [m.name, m.stock, rs(Number(m.stock) * Number(m.price || 0))]),
    },
    { title: 'Laboratory report: tests by status', head: ['Status', 'Tests'], rows: countBy(db.labs, (l) => l.status) },
    { title: 'Staff report: by department', head: ['Department', 'Staff'], rows: countBy(db.staff, (s) => s.dept) },
    {
      title: `Staff report: days present in ${month}`,
      head: ['Employee', 'Days present'],
      rows: db.staff.map((s) => [
        s.name,
        Object.entries(s.att || {}).filter(([day, mark]) => day.startsWith(month) && mark === 'Present').length,
      ]),
    },
  ]

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