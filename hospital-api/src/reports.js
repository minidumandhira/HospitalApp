import { db } from './db.js'
import { today } from './dates.js'
import { invoiceShape, toCents } from './billing.js'

const rs = (cents) => 'Rs ' + (cents / 100).toLocaleString('en-US')
const counts = (sql, ...args) => db.prepare(sql).all(...args).map((r) => [r.label, r.n])

// Each report says who may see it. The clinical staff get clinical reports,
// the accountant gets money reports, and the administrator gets everything.
export const REPORTS = [
  {
    title: 'Patient report: patients by gender', roles: ['admin', 'doctor'], head: ['Gender', 'Patients'],
    rows: () => counts("SELECT COALESCE(NULLIF(gender, ''), '—') AS label, COUNT(*) AS n FROM patients GROUP BY label ORDER BY label"),
  },
  {
    title: 'Appointment report: by status', roles: ['admin', 'doctor'], head: ['Status', 'Appointments'],
    rows: () => counts('SELECT status AS label, COUNT(*) AS n FROM appointments GROUP BY status ORDER BY status'),
  },
  {
    title: 'Revenue report: collected by month', roles: ['admin', 'acct'], head: ['Month', 'Collected'],
    rows: () => db.prepare('SELECT SUBSTR(paid_on, 1, 7) AS month, amount FROM payments').all()
      .reduce((months, p) => ({ ...months, [p.month]: (months[p.month] ?? 0) + toCents(p.amount) }), {}),
    format: (byMonth) => Object.entries(byMonth).sort().map(([month, cents]) => [month, rs(cents)]),
  },
  {
    title: 'Outstanding invoices', roles: ['admin', 'acct'], head: ['Invoice', 'Patient', 'Balance'],
    rows: () => db.prepare('SELECT i.*, p.name AS patient_name FROM invoices i JOIN patients p ON p.id = i.patient_id ORDER BY i.rowid').all()
      .map((row) => ({ ...invoiceShape(row), patientName: row.patient_name })).filter((inv) => inv.balance > 0)
      .map((inv) => [inv.no, inv.patientName, rs(toCents(inv.balance))]),
  },
  {
    title: 'Pharmacy report: stock value', roles: ['admin', 'acct'], head: ['Medicine', 'Stock', 'Value'],
    rows: () => db.prepare('SELECT name, stock, unit_price FROM medicines ORDER BY name COLLATE NOCASE').all()
      .map((m) => [m.name, m.stock, rs(toCents(m.stock * m.unit_price))]),
  },
  {
    title: 'Laboratory report: tests by status', roles: ['admin', 'doctor'], head: ['Status', 'Tests'],
    rows: () => counts('SELECT status AS label, COUNT(*) AS n FROM lab_tests GROUP BY status ORDER BY status'),
  },
  {
    title: 'Staff report: by department', roles: ['admin'], head: ['Department', 'Staff'],
    rows: () => counts(`SELECT COALESCE(d.name, '—') AS label, COUNT(*) AS n FROM employees e
                        LEFT JOIN departments d ON d.id = e.department_id GROUP BY label ORDER BY label`),
  },
  {
    title: 'Staff report: days present this month', roles: ['admin'], head: ['Employee', 'Days present'],
    rows: () => db.prepare(`SELECT e.name AS label, COUNT(a.id) AS n FROM employees e
                            LEFT JOIN attendance a ON a.employee_id = e.id AND a.status = 'Present' AND a.day LIKE ?
                            GROUP BY e.id ORDER BY e.name COLLATE NOCASE`).all(today().slice(0, 7) + '-%').map((r) => [r.label, r.n]),
  },
]

// The reports one role may see, ready to send.
export const reportsFor = (role) =>
  REPORTS.filter((r) => r.roles.includes(role)).map((r) => {
    const rows = r.rows()
    return { title: r.title, head: r.head, rows: r.format ? r.format(rows) : rows }
  })