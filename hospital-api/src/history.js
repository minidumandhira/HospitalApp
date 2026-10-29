import { db } from './db.js'

// Turn nulls into '' so the React app can show every value without checks.
const blanks = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ''])))

// A patient's medical history. Only clinical facts are included. Money fields and internal
// flags (cost, billed) are left out on purpose. Lab results are included only when asked for.
export function buildHistory(patientId, { includeLabs }) {
  const patient = db.prepare(
    'SELECT id, name, dob, gender, phone, blood_group AS blood, address, allergies FROM patients WHERE id = ?').get(patientId)
  if (!patient) return null

  return {
    patient: blanks([patient])[0],
    records: blanks(db.prepare(
      `SELECT r.id, r.record_date AS date, r.diagnosis, r.treatment, r.dosage, r.quantity AS qty,
              r.prescription_notes AS prescription, r.report, r.dispensed_on AS disp,
              d.name AS doctorName, m.name AS medName
       FROM medical_records r JOIN doctors d ON d.id = r.doctor_id LEFT JOIN medicines m ON m.id = r.medicine_id
       WHERE r.patient_id = ? ORDER BY r.record_date DESC, r.rowid DESC`).all(patientId)),
    labs: includeLabs ? blanks(db.prepare(
      `SELECT id, test_name AS test, requested_on AS date, status, result FROM lab_tests
       WHERE patient_id = ? ORDER BY requested_on DESC, rowid DESC`).all(patientId)) : [],
    appointments: blanks(db.prepare(
      `SELECT a.id, a.scheduled_at AS "when", a.status, d.name AS doctorName
       FROM appointments a JOIN doctors d ON d.id = a.doctor_id
       WHERE a.patient_id = ? ORDER BY a.scheduled_at DESC`).all(patientId)),
    stays: blanks(db.prepare(
      `SELECT id, admitted_on AS ad, discharged_on AS "out", ward, bed FROM admissions
       WHERE patient_id = ? ORDER BY admitted_on DESC`).all(patientId)),
  }
}