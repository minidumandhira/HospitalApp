import { db } from './db.js'
import { today, daysFromToday } from './dates.js'
import { f } from './fields.js'

// Everything the server knows about each kind of record, in one place:
//   table     which database table holds it
//   fields    its fields (API name -> description). Names match the React app's modules.
//   read      roles that may see everything          basic: roles that may see only id and name
//   write     roles that may add and change           remove: roles that may delete (default: admin)
//   check     extra business rules for a save         locked / lockedDelete: when a record is frozen
//   extra     columns the server manages (clients can read them but never set them)

const STAFF = ['admin', 'doctor', 'nurse', 'reception', 'lab', 'pharm', 'acct']
const ON_INVOICE = 'This record is on an invoice, so it can no longer be changed.'
const asText = (v) => String(v ?? '')

// Which status changes are allowed. A status can only move forward along these lines.
const NEXT = {
  appointment: { Scheduled: ['Checked-in', 'Cancelled'], 'Checked-in': ['Completed', 'Cancelled'], Completed: [], Cancelled: [] },
  'lab test': { Requested: ['Sample collected'], 'Sample collected': ['Completed'], Completed: [] },
  leave: { Pending: ['Approved', 'Rejected'], Approved: [], Rejected: [] },
}
function badMove(kind, existing, next) {
  if (!existing || next === existing.status) return ''
  return NEXT[kind][existing.status]?.includes(next) ? '' : `The status cannot change from ${existing.status} to ${next}.`
}

export const RESOURCES = {
  patients: {
    noun: 'patient', table: 'patients', order: 'name COLLATE NOCASE',
    read: ['admin', 'doctor', 'nurse', 'reception'],
    basic: ['lab', 'pharm', 'acct'],            // they need names on their own screens, nothing more
    write: ['admin', 'doctor', 'nurse', 'reception'],
    fields: {
      name: f.text('name', 'Name', { required: true, max: 100 }),
      dob: f.date('dob', 'Date of birth'),
      gender: f.enum('gender', 'Gender', ['Female', 'Male', 'Other']),
      phone: f.text('phone', 'Phone', { max: 30 }),
      blood: f.enum('blood_group', 'Blood group', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
      address: f.text('address', 'Address'),
      allergies: f.text('allergies', 'Allergies'),
    },
  },

  depts: {
    noun: 'department', table: 'departments', order: 'name COLLATE NOCASE',
    read: [...STAFF, 'patient'], write: ['admin'],
    uniqueMessage: 'That department already exists.',
    fields: { name: f.text('name', 'Name', { required: true, max: 100 }) },
  },

  doctors: {
    noun: 'doctor', table: 'doctors', order: 'name COLLATE NOCASE',
    read: [...STAFF, 'patient'], write: ['admin'],
    fields: {
      name: f.text('name', 'Name', { required: true, max: 100 }),
      dept: f.ref('department_id', 'Department', 'departments'),
      phone: f.text('phone', 'Phone', { max: 30 }),
      fee: f.num('fee', 'Consultation fee', { blank: 0 }),
      days: f.text('working_days', 'Working days'),
      hours: f.text('working_hours', 'Hours'),
    },
  },

  appts: {
    noun: 'appointment', table: 'appointments', order: 'scheduled_at',
    read: ['admin', 'doctor', 'nurse', 'reception'], write: ['admin', 'doctor', 'nurse', 'reception'],
    uniqueMessage: 'That doctor already has an appointment at this time.', // from the database's own rule
    extra: { billed: 'billed' },
    fields: {
      patient: f.ref('patient_id', 'Patient', 'patients', { required: true }),
      doctor: f.ref('doctor_id', 'Doctor', 'doctors', { required: true }),
      when: f.time('scheduled_at', 'Date and time', { required: true }),
      reason: f.text('reason', 'Reason'),
      status: f.enum('status', 'Status', ['Scheduled', 'Checked-in', 'Completed', 'Cancelled'], { default: 'Scheduled' }),
    },
    locked: (r) => (r.billed ? ON_INVOICE : ''),
    check: (v, existing) => {
      if (!existing && v.status !== 'Scheduled') return 'A new appointment starts as Scheduled.'
      return badMove('appointment', existing, v.status)
    },
  },

  adm: {
    noun: 'admission', table: 'admissions', order: 'admitted_on DESC',
    read: ['admin', 'nurse', 'reception'], write: ['admin', 'nurse', 'reception'],
    extra: { billed: 'billed' },
    fields: {
      patient: f.ref('patient_id', 'Patient', 'patients', { required: true }),
      ward: f.text('ward', 'Ward'),
      bed: f.text('bed', 'Bed'),
      rate: f.num('daily_rate', 'Daily charge', { blank: 0 }),
      ad: f.date('admitted_on', 'Admitted on', { required: true, default: today }),
      out: f.date('discharged_on', 'Discharged on'),
    },
    locked: (r) => (r.billed ? ON_INVOICE : ''),
    check: (v) => (v.out && v.out < v.ad ? 'The discharge date is before the admission date.' : ''),
  },

  records: {
    noun: 'medical record', table: 'medical_records', order: 'record_date DESC',
    read: ['admin', 'doctor', 'nurse'], write: ['admin', 'doctor', 'nurse'],
    extra: { disp: 'dispensed_on', cost: 'dispensed_cost', billed: 'billed' }, // set by the pharmacy and billing, never by clients
    fields: {
      patient: f.ref('patient_id', 'Patient', 'patients', { required: true }),
      doctor: f.ref('doctor_id', 'Doctor', 'doctors', { required: true }),
      date: f.date('record_date', 'Date', { required: true, default: today }),
      diagnosis: f.text('diagnosis', 'Diagnosis', { required: true }),
      treatment: f.long('treatment', 'Treatment'),
      med: f.ref('medicine_id', 'Medicine', 'medicines'),
      qty: f.int('quantity', 'Quantity'),
      dosage: f.text('dosage', 'Dosage'),
      prescription: f.long('prescription_notes', 'Prescription notes'),
      report: f.long('report', 'Medical report'),
    },
    locked: (r) => (r.billed ? ON_INVOICE : ''),
    lockedDelete: (r) => (r.disp ? 'A dispensed prescription cannot be deleted.' : r.billed ? ON_INVOICE : ''),
    check: (v, existing) => {
      if (v.med && !(Number(v.qty) > 0)) return 'Enter a quantity for the prescribed medicine.'
      if (existing?.disp && (asText(v.med) !== asText(existing.med) || asText(v.qty) !== asText(existing.qty)))
        return 'This prescription was already dispensed, so the medicine and quantity cannot change.'
      return ''
    },
  },

  labs: {
    noun: 'lab test', table: 'lab_tests', order: 'requested_on DESC',
    read: ['admin', 'doctor', 'lab'], write: ['admin', 'doctor', 'lab'],
    extra: { billed: 'billed' },
    fields: {
      patient: f.ref('patient_id', 'Patient', 'patients', { required: true }),
      doctor: f.ref('doctor_id', 'Requested by', 'doctors'),
      test: f.text('test_name', 'Test', { required: true }),
      price: f.num('price', 'Charge', { blank: 0 }),
      date: f.date('requested_on', 'Requested on', { default: today }),
      status: f.enum('status', 'Status', ['Requested', 'Sample collected', 'Completed'], { default: 'Requested' }),
      result: f.long('result', 'Result'),
    },
    locked: (r) => (r.billed ? ON_INVOICE : ''),
    check: (v, existing) => {
      if (!existing && v.status !== 'Requested') return 'A new test request starts as Requested.'
      const move = badMove('lab test', existing, v.status)
      if (move) return move
      return v.status === 'Completed' && !v.result ? 'Enter the result before marking the test Completed.' : ''
    },
  },

  meds: {
    noun: 'medicine', table: 'medicines', order: 'name COLLATE NOCASE',
    read: ['admin', 'doctor', 'nurse', 'pharm'], write: ['admin', 'pharm'],
    fields: {
      name: f.text('name', 'Medicine', { required: true, max: 100 }),
      batch: f.text('batch', 'Batch', { max: 50 }),
      stock: f.int('stock', 'Stock', { required: true }),
      reorder: f.int('reorder_level', 'Reorder level', { blank: 0 }),
      price: f.num('unit_price', 'Unit price', { blank: 0 }),
      expiry: f.date('expiry_date', 'Expiry date'),
    },
  },

  staff: {
    noun: 'employee', table: 'employees', order: 'name COLLATE NOCASE',
    read: ['admin'], write: ['admin'],
    fields: {
      name: f.text('name', 'Name', { required: true, max: 100 }),
      role: f.text('job_title', 'Job title', { max: 100 }),
      dept: f.ref('department_id', 'Department', 'departments'),
      phone: f.text('phone', 'Phone', { max: 30 }),
      joined: f.date('joined_on', 'Joined on'),
    },
    // Add each employee's recent attendance as { 'YYYY-MM-DD': 'Present' | 'Absent' }.
    decorate: (items) => {
      const marks = db.prepare('SELECT employee_id, day, status FROM attendance WHERE day >= ?').all(daysFromToday(-62))
      return items.map((item) => ({
        ...item,
        att: Object.fromEntries(marks.filter((m) => m.employee_id === item.id).map((m) => [m.day, m.status])),
      }))
    },
  },

  leaves: {
    noun: 'leave record', table: 'leave_requests', order: 'start_date DESC',
    read: ['admin'], write: ['admin'],
    fields: {
      staff: f.ref('employee_id', 'Employee', 'employees', { required: true }),
      from: f.date('start_date', 'From', { required: true }),
      to: f.date('end_date', 'To', { required: true }),
      reason: f.text('reason', 'Reason'),
      status: f.enum('status', 'Status', ['Pending', 'Approved', 'Rejected'], { default: 'Pending' }),
    },
    check: (v, existing) => (v.to < v.from ? 'The end date is before the start date.' : badMove('leave', existing, v.status)),
  },
}