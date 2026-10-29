// The user roles from the specification, plus the patient.
export const ROLES = [
  ['admin', 'Administrator'],
  ['doctor', 'Doctor'],
  ['nurse', 'Nurse'],
  ['reception', 'Receptionist'],
  ['lab', 'Laboratory staff'],
  ['pharm', 'Pharmacist'],
  ['acct', 'Accountant'],
  ['patient', 'Patient'],
]

// Which screens each role sees in the menu. 'all' means everything.
// This only decides what to show. The server checks the role again on every request.
export const ACCESS = {
  admin: 'all',
  doctor: ['dash', 'patients', 'appts', 'records', 'labs', 'reports'],
  nurse: ['dash', 'patients', 'appts', 'records', 'adm'],
  reception: ['dash', 'patients', 'appts', 'adm'],
  lab: ['dash', 'labs'],
  pharm: ['dash', 'meds', 'rx'],
  acct: ['dash', 'bills', 'reports'],
  patient: ['my', 'myrecord'], // patient portal screens
}

// Portal screens belong to patients only. Even the administrator does not get them.
export const PORTAL_SCREENS = ['my', 'myrecord']

// Screens every signed-in user has.
export const COMMON_SCREENS = ['account']

export const roleName = (role) => ROLES.find(([v]) => v === role)?.[1] ?? role