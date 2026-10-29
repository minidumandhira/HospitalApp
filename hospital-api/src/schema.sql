

-- ===== Users and roles =====
CREATE TABLE IF NOT EXISTS roles (
  id   TEXT PRIMARY KEY,            -- 'admin', 'doctor', ...
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS patients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  dob         TEXT,
  gender      TEXT,
  phone       TEXT,
  blood_group TEXT,
  address     TEXT,
  allergies   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  role_id         TEXT NOT NULL REFERENCES roles(id),
  password_hash   TEXT NOT NULL,            -- a bcrypt hash, never the password itself
  patient_id      TEXT REFERENCES patients(id) ON DELETE SET NULL, -- set for patient logins only
  failed_attempts INTEGER NOT NULL DEFAULT 0,  -- for locking an account after wrong passwords
  locked_until    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ===== Doctors and appointments =====
CREATE TABLE IF NOT EXISTS doctors (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  department_id TEXT REFERENCES departments(id),
  phone         TEXT,
  fee           REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
  working_days  TEXT,
  working_hours TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patients(id),
  doctor_id    TEXT NOT NULL REFERENCES doctors(id),
  scheduled_at TEXT NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'Scheduled'
               CHECK (status IN ('Scheduled', 'Checked-in', 'Completed', 'Cancelled')),
  billed       INTEGER NOT NULL DEFAULT 0
);
-- The database itself refuses two active appointments for one doctor at one time.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_slot_per_doctor
  ON appointments (doctor_id, scheduled_at) WHERE status <> 'Cancelled';

-- ===== Inpatients =====
CREATE TABLE IF NOT EXISTS admissions (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  ward          TEXT,
  bed           TEXT,
  daily_rate    REAL NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  admitted_on   TEXT NOT NULL,
  discharged_on TEXT,
  billed        INTEGER NOT NULL DEFAULT 0,
  CHECK (discharged_on IS NULL OR discharged_on >= admitted_on)
);

-- ===== Pharmacy =====
CREATE TABLE IF NOT EXISTS medicines (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  batch         TEXT,
  stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),   -- stock can never go negative
  reorder_level INTEGER NOT NULL DEFAULT 0,
  unit_price    REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  expiry_date   TEXT
);

-- ===== Electronic medical records (with the prescription) =====
CREATE TABLE IF NOT EXISTS medical_records (
  id                 TEXT PRIMARY KEY,
  patient_id         TEXT NOT NULL REFERENCES patients(id),
  doctor_id          TEXT NOT NULL REFERENCES doctors(id),
  record_date        TEXT NOT NULL,
  diagnosis          TEXT NOT NULL,
  treatment          TEXT,
  medicine_id        TEXT REFERENCES medicines(id),
  quantity           INTEGER CHECK (quantity IS NULL OR quantity > 0),
  dosage             TEXT,
  prescription_notes TEXT,
  report             TEXT,
  dispensed_on       TEXT,            -- set when the pharmacy dispenses
  dispensed_cost     REAL,            -- quantity x price on that day
  billed             INTEGER NOT NULL DEFAULT 0
);

-- ===== Laboratory =====
CREATE TABLE IF NOT EXISTS lab_tests (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patients(id),
  doctor_id    TEXT REFERENCES doctors(id),
  test_name    TEXT NOT NULL,
  price        REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  requested_on TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Requested'
               CHECK (status IN ('Requested', 'Sample collected', 'Completed')),
  result       TEXT,
  billed       INTEGER NOT NULL DEFAULT 0
);

-- ===== Billing and payments =====
CREATE TABLE IF NOT EXISTS invoices (
  id           TEXT PRIMARY KEY,
  invoice_no   TEXT NOT NULL UNIQUE,
  patient_id   TEXT NOT NULL REFERENCES patients(id),
  invoice_date TEXT NOT NULL,
  total        REAL NOT NULL CHECK (total >= 0)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      REAL NOT NULL CHECK (amount >= 0),
  source      TEXT NOT NULL,          -- which table the charge came from
  source_id   TEXT NOT NULL           -- and which row
);

CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  paid_on    TEXT NOT NULL,
  amount     REAL NOT NULL CHECK (amount > 0),
  method     TEXT NOT NULL
);

-- ===== Staff =====
CREATE TABLE IF NOT EXISTS employees (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  job_title     TEXT,
  department_id TEXT REFERENCES departments(id),
  phone         TEXT,
  joined_on     TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
  UNIQUE (employee_id, day)           -- one mark per person per day
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  CHECK (end_date >= start_date)
);

-- ===== Audit trail =====
CREATE TABLE IF NOT EXISTS audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  username TEXT NOT NULL,
  action   TEXT NOT NULL
);

-- ===== Sign-in sessions =====
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);