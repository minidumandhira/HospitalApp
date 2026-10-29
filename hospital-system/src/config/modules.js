

import PatientHistory from '../components/PatientHistory'
import { today, stockAlerts } from '../utils'
import { ROLES } from './roles'
import LabReport from '../components/LabReport'

const patientOptions = (db) => [['', 'Select patient'], ...db.patients.map((p) => [p.id, p.name])]
const medOptions = (db) => [['', 'None'], ...db.meds.map((m) => [m.id, m.name])]
const doctorOptions = (db) => [['', 'Select doctor'], ...db.doctors.map((d) => [d.id, d.name])]
const deptOptions = (db) => [['', 'Select department'], ...db.depts.map((d) => [d.id, d.name])]

export const MODULES = {
  patients: {
    title: 'Patients',
    noun: 'patient',
    fields: [
      { key: 'name', label: 'Full name', required: true },
      { key: 'dob', label: 'Date of birth', type: 'date' },
      { key: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Other'] },
      { key: 'phone', label: 'Phone' },
      {
        key: 'blood',
        label: 'Blood group',
        type: 'select',
        options: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      },
      { key: 'address', label: 'Address' },
      { key: 'allergies', label: 'Allergies' },
    ],
    columns: ['name', 'gender', 'phone', 'blood'],
    viewer: PatientHistory,
    // Only the clinical staff may read a patient's history. The server checks this too.
    rowActions: (r, { user }) => (['admin', 'doctor', 'nurse'].includes(user.role) ? [{ label: 'History', view: true }] : []),
  },

  appts: {
    title: 'Appointments',
    noun: 'appointment',
    editLabel: 'Reschedule',
    calendar: true,
    fields: [
      { key: 'patient', label: 'Patient', type: 'select', options: patientOptions, required: true },
      { key: 'doctor', label: 'Doctor', type: 'select', options: doctorOptions, required: true },
      { key: 'when', label: 'Date and time', type: 'datetime-local', required: true },
      { key: 'reason', label: 'Reason' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['Scheduled', 'Checked-in', 'Completed', 'Cancelled'],
        default: 'Scheduled',
      },
    ],
    columns: ['when', 'patient', 'doctor', 'status'],
    sort: (a, b) => (a.when < b.when ? -1 : 1), // upcoming first
    // Status tracking: Scheduled -> Checked-in -> Completed (or Cancelled at any open stage).
    rowActions: (r, { update }) => {
      const set = (status, label) => ({ label, run: () => update('appts', r.id, { status }) })
      if (r.status === 'Scheduled') return [set('Checked-in', 'Check in'), set('Cancelled', 'Cancel')]
      if (r.status === 'Checked-in') return [set('Completed', 'Complete'), set('Cancelled', 'Cancel')]
      return []
    },
  },

  records: {
    title: 'Medical records',
    noun: 'record',
    fields: [
      { key: 'patient', label: 'Patient', type: 'select', options: patientOptions, required: true },
      { key: 'doctor', label: 'Doctor', type: 'select', options: doctorOptions, required: true },
      { key: 'date', label: 'Date', type: 'date', required: true, default: today },
      { key: 'diagnosis', label: 'Diagnosis', required: true },
      { key: 'treatment', label: 'Treatment', type: 'textarea' },
      { key: 'med', label: 'Prescribed medicine (from stock)', type: 'select', options: medOptions },
      { key: 'qty', label: 'Quantity', type: 'number' },
      { key: 'dosage', label: 'Dosage instructions' },
      { key: 'prescription', label: 'Prescription notes', type: 'textarea' },
      { key: 'report', label: 'Medical report', type: 'textarea' },
    ],
    columns: ['date', 'patient', 'doctor', 'diagnosis'],
    sort: (a, b) => (a.date < b.date ? 1 : -1), // latest first
  },

  labs: {
    title: 'Laboratory',
    noun: 'test request',
    fields: [
      { key: 'patient', label: 'Patient', type: 'select', options: patientOptions, required: true },
      { key: 'doctor', label: 'Requested by', type: 'select', options: doctorOptions },
      { key: 'test', label: 'Test', required: true },
      { key: 'price', label: 'Charge (Rs)', type: 'number', money: true },
      { key: 'date', label: 'Requested on', type: 'date', default: today },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['Requested', 'Sample collected', 'Completed'],
        default: 'Requested',
      },
      { key: 'result', label: 'Result', type: 'textarea' },
    ],
    columns: ['date', 'patient', 'test', 'status'],
    sort: (a, b) => (a.date < b.date ? 1 : -1),
    viewer: LabReport,
    viewerTitle: () => 'Laboratory report',
    // Workflow: Requested -> Sample collected -> Completed (result entered) -> printable report.
    rowActions: (r, { update }) => {
      if (r.status === 'Requested')
        return [{ label: 'Collect sample', run: () => update('labs', r.id, { status: 'Sample collected' }) }]
      if (r.status === 'Sample collected')
        return [{
          label: 'Enter result',
          form: { fields: [{ key: 'result', label: 'Result', type: 'textarea', required: true }] },
          run: (v) => update('labs', r.id, { status: 'Completed', result: v.result }),
        }]
      return [{ label: 'Report', view: true }]
    },
  },

  meds: {
    title: 'Pharmacy stock',
    noun: 'medicine',
    fields: [
      { key: 'name', label: 'Medicine', required: true },
      { key: 'batch', label: 'Batch' },
      { key: 'stock', label: 'Stock', type: 'number', required: true },
      { key: 'reorder', label: 'Reorder level', type: 'number' },
      { key: 'price', label: 'Unit price (Rs)', type: 'number', money: true },
      { key: 'expiry', label: 'Expiry date', type: 'date' },
    ],
    columns: ['name', 'batch', 'stock', 'price', 'expiry', 'alerts'],
    extra: [{ key: 'alerts', label: 'Alerts', value: (m) => stockAlerts(m).join(', ') }],
    sort: (a, b) => (a.name < b.name ? -1 : 1),
    // Restocking adds to the stock inside the database, so two people cannot overwrite each other.
    rowActions: (m, { api, put }) => [{
      label: 'Restock',
      form: {
        fields: [
          { key: 'qty', label: 'Quantity received', type: 'number', required: true },
          { key: 'expiry', label: 'New expiry date (optional)', type: 'date' },
        ],
      },
      run: async (v) => put('meds', await api.post(`/meds/${m.id}/restock`, { qty: v.qty, expiry: v.expiry })),
    }],
  },

  adm: {
    title: 'Admissions',
    noun: 'admission',
    fields: [
      { key: 'patient', label: 'Patient', type: 'select', options: patientOptions, required: true },
      { key: 'ward', label: 'Ward' },
      { key: 'bed', label: 'Bed' },
      { key: 'rate', label: 'Daily charge (Rs)', type: 'number', money: true },
      { key: 'ad', label: 'Admitted on', type: 'date', required: true, default: today },
      { key: 'out', label: 'Discharged on', type: 'date' },
    ],
    columns: ['patient', 'ward', 'bed', 'ad', 'status'],
    extra: [{ key: 'status', label: 'Status', value: (r) => (r.out ? 'Discharged' : 'Admitted') }],
    sort: (a, b) => (a.ad < b.ad ? 1 : -1),
    rowActions: (r, { update }) =>
      r.out ? [] : [{ label: 'Discharge', run: () => update('adm', r.id, { out: today() }) }],
  },

  doctors: {
    title: 'Doctors',
    noun: 'doctor',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'dept', label: 'Department', type: 'select', options: deptOptions },
      { key: 'phone', label: 'Phone' },
      { key: 'fee', label: 'Consultation fee (Rs)', type: 'number', money: true },
      { key: 'days', label: 'Working days' },
      { key: 'hours', label: 'Hours' },
    ],
    columns: ['name', 'dept', 'days', 'hours', 'fee'],
  },

  depts: {
    title: 'Departments',
    noun: 'department',
    fields: [{ key: 'name', label: 'Name', required: true }],
    columns: ['name'],
  },

  staff: {
    title: 'Staff',
    noun: 'employee',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'role', label: 'Job title' },
      { key: 'dept', label: 'Department', type: 'select', options: deptOptions },
      { key: 'phone', label: 'Phone' },
      { key: 'joined', label: 'Joined on', type: 'date' },
    ],
    columns: ['name', 'role', 'dept', 'phone', 'status'],
    // The server keeps attendance as { 'YYYY-MM-DD': 'Present' | 'Absent' } on each employee.
    extra: [{ key: 'status', label: 'Today', value: (r) => r.att?.[today()] ?? 'Not marked' }],
    rowActions: (r, { api, put }) =>
      ['Present', 'Absent'].map((mark) => ({
        label: mark,
        run: async () => put('staff', await api.post(`/staff/${r.id}/attendance`, { status: mark })),
      })),
  },

  leaves: {
    title: 'Leave',
    noun: 'leave record',
    fields: [
      { key: 'staff', label: 'Employee', type: 'select', required: true,
        options: (db) => [['', 'Select employee'], ...db.staff.map((s) => [s.id, s.name])] },
      { key: 'from', label: 'From', type: 'date', required: true },
      { key: 'to', label: 'To', type: 'date', required: true },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    ],
    columns: ['staff', 'from', 'to', 'status'],
    sort: (a, b) => (a.from < b.from ? 1 : -1),
    rowActions: (r, { update }) => {
      if (r.status !== 'Pending') return []
      const set = (status, label) => ({ label, run: () => update('leaves', r.id, { status }) })
      return [set('Approved', 'Approve'), set('Rejected', 'Reject')]
    },
  },

  users: {
    title: 'Users',
    noun: 'user',
    fields: [
      { key: 'username', label: 'Username', required: true },
      { key: 'name', label: 'Full name', required: true },
      { key: 'role', label: 'Role', type: 'select', options: ROLES, default: 'doctor', required: true },
      { key: 'pw', label: 'Password (leave blank to keep)', type: 'password', secret: true },
    ],
    columns: ['username', 'name', 'role'],
    // The server checks the username, the password rules and hashes the password.
  },
}

// Pages that are not simple data tables. Each sits in the menu right after a related module.
const CUSTOM_PAGES = {
  meds: { key: 'rx', label: 'Prescriptions', to: '/rx' },
  adm: { key: 'bills', label: 'Billing', to: '/bills' },
  leaves: { key: 'reports', label: 'Reports', to: '/reports' },
  users: { key: 'audit', label: 'Audit and backup', to: '/audit' },
}

// Sidebar entries are built from the modules, plus the dashboard and the custom pages.
export const NAV = [
  { key: 'dash', label: 'Dashboard', to: '/' },
  ...Object.entries(MODULES).flatMap(([key, m]) => {
    const item = { key, label: m.title, to: '/' + key }
    return CUSTOM_PAGES[key] ? [item, CUSTOM_PAGES[key]] : [item]
  }),
  // Patient portal
  { key: 'my', label: 'My appointments', to: '/my' },
  { key: 'myrecord', label: 'My health record', to: '/myrecord' },
  // Every signed-in user
  { key: 'account', label: 'Change password', to: '/account' },
]