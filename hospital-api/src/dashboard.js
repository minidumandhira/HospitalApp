import { db } from './db.js'
import { today, daysFromToday } from './dates.js'
import { invoiceShape, toCents } from './billing.js'

// Which roles see which part of the dashboard.
const SEE = {
  patients: ['admin', 'doctor', 'nurse', 'reception'],
  appointments: ['admin', 'doctor', 'nurse', 'reception'],
  admitted: ['admin', 'nurse', 'reception'],
  labs: ['admin', 'doctor', 'lab'],
  pharmacy: ['admin', 'pharm'],
  money: ['admin', 'acct'],
  doctors: ['admin'],
}
const count = (sql, ...args) => db.prepare(sql).get(...args).n

// Warnings about one medicine: low stock, expired, or expiring within 60 days.
function stockAlerts(med) {
  const alerts = []
  if (med.stock <= med.reorder_level) alerts.push('Low stock')
  if (med.expiry_date && med.expiry_date < today()) alerts.push('Expired')
  else if (med.expiry_date && med.expiry_date <= daysFromToday(60)) alerts.push('Expires soon')
  return alerts
}

// Only the parts this role is allowed to see are included.
export function buildDashboard(role) {
  const out = {}
  const sees = (part) => SEE[part].includes(role)

  if (sees('patients')) out.patients = count('SELECT COUNT(*) AS n FROM patients')
  if (sees('appointments')) {
    const list = db.prepare(
      `SELECT a.id, SUBSTR(a.scheduled_at, 12) AS time, p.name AS patientName, d.name AS doctorName, a.status
       FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id
       WHERE a.scheduled_at LIKE ? AND a.status <> 'Cancelled' ORDER BY a.scheduled_at`).all(today() + 'T%')
    out.today = { count: list.length, list }
  }
  if (sees('admitted')) out.admitted = count('SELECT COUNT(*) AS n FROM admissions WHERE discharged_on IS NULL')
  if (sees('labs')) out.openLabs = count("SELECT COUNT(*) AS n FROM lab_tests WHERE status <> 'Completed'")
  if (sees('pharmacy')) {
    out.pharmacyAlerts = db.prepare('SELECT name, stock, reorder_level, expiry_date FROM medicines ORDER BY name COLLATE NOCASE').all()
      .flatMap((m) => stockAlerts(m).map((a) => `${m.name} — ${a}`))
  }
  if (sees('money')) {
    const invoices = db.prepare('SELECT * FROM invoices').all().map(invoiceShape)
    out.revenue = invoices.reduce((sum, inv) => sum + toCents(inv.paid), 0) / 100
    out.outstanding = invoices.reduce((sum, inv) => sum + toCents(inv.balance), 0) / 100
  }
  if (sees('doctors')) out.doctors = count('SELECT COUNT(*) AS n FROM doctors')
  return out
}