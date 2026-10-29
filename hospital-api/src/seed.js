import bcrypt from 'bcryptjs'
import { db, newId } from './db.js'

const ROLES = [
  ['admin', 'Administrator'],
  ['doctor', 'Doctor'],
  ['nurse', 'Nurse'],
  ['reception', 'Receptionist'],
  ['lab', 'Laboratory staff'],
  ['pharm', 'Pharmacist'],
  ['acct', 'Accountant'],
  ['patient', 'Patient'],
]

const DEPARTMENTS = [
  'General Medicine', 'Pediatrics', 'Cardiology', 'Orthopedics', 'Gynecology',
  'Laboratory', 'Pharmacy', 'Nursing', 'Administration',
]

// username, full name, role. The demo password is the username followed by 123.
const ACCOUNTS = [
  ['admin', 'Administrator', 'admin'],
  ['doctor', 'Dr. Amara Perera', 'doctor'],
  ['nurse', 'Nurse Kumari', 'nurse'],
  ['reception', 'Reception Desk', 'reception'],
  ['lab', 'Lab Technician', 'lab'],
  ['pharmacy', 'Pharmacist', 'pharm'],
  ['accounts', 'Accountant', 'acct'],
]

// A date n days from today, as 'YYYY-MM-DD' in local time.
const inDays = (n) => {
  const d = new Date(Date.now() + n * 864e5)
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}

// Adds the starting data, but only into an empty database.
export function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS n FROM roles').get().n > 0) return false

  const run = db.transaction(() => {
    const addRole = db.prepare('INSERT INTO roles (id, name) VALUES (?, ?)')
    ROLES.forEach(([id, name]) => addRole.run(id, name))

    const dept = {}
    const addDept = db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)')
    DEPARTMENTS.forEach((name) => { dept[name] = newId(); addDept.run(dept[name], name) })

    const addPatient = db.prepare(
      `INSERT INTO patients (id, name, dob, gender, phone, blood_group, address, allergies)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    const nimali = newId()
    addPatient.run(nimali, 'Nimali Fernando', '1988-04-12', 'Female', '0771234567', 'O+', 'Matara', 'Penicillin')
    addPatient.run(newId(), 'Kasun Silva', '1975-09-30', 'Male', '0712345678', 'A+', 'Galle', '')

    const addUser = db.prepare(
      'INSERT INTO users (id, username, name, role_id, password_hash, patient_id) VALUES (?, ?, ?, ?, ?, ?)')
    const hash = (text) => bcrypt.hashSync(text, 10)
    ACCOUNTS.forEach(([username, name, role]) => addUser.run(newId(), username, name, role, hash(username + '123'), null))
    addUser.run(newId(), 'patient', 'Nimali Fernando', 'patient', hash('patient123'), nimali) // a patient login

    const addDoctor = db.prepare(
      `INSERT INTO doctors (id, name, department_id, phone, fee, working_days, working_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
    addDoctor.run(newId(), 'Dr. Amara Perera', dept['General Medicine'], '0112223344', 2500, 'Mon–Fri', '09:00–13:00')
    addDoctor.run(newId(), 'Dr. Ruwan Jayasuriya', dept['Cardiology'], '0112223355', 4000, 'Tue, Thu', '14:00–18:00')

    // Amoxicillin is low on stock and close to expiry, so the pharmacy alerts have something to show.
    const addMed = db.prepare(
      `INSERT INTO medicines (id, name, batch, stock, reorder_level, unit_price, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
    addMed.run(newId(), 'Paracetamol 500 mg', 'PC-2291', 400, 100, 5, inDays(400))
    addMed.run(newId(), 'Amoxicillin 250 mg', 'AM-1180', 40, 60, 22, inDays(30))
    addMed.run(newId(), 'Atorvastatin 20 mg', 'AT-7710', 150, 50, 35, inDays(300))

    const addEmployee = db.prepare(
      'INSERT INTO employees (id, name, job_title, department_id, phone, joined_on) VALUES (?, ?, ?, ?, ?, ?)')
    addEmployee.run(newId(), 'Nurse Kumari', 'Staff nurse', dept['Nursing'], '0771112233', '2021-03-01')
    addEmployee.run(newId(), 'Sunil Wickramasinghe', 'Receptionist', dept['Administration'], '0772223344', '2022-07-15')
  })

  run() // all the inserts happen together, or none of them do
  return true
}