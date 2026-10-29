import { db } from './db.js'

// ---------- Describing a field ----------
// Each resource lists its fields with these helpers. A field says which database column it
// uses, what kind of value it holds, and whether it is required. The same description is used to
// check what clients send and to build what the server returns.
const field = (type) => (col, label, options = {}) => ({ type, col, label, ...options })
export const f = {
  text: field('text'),       // short text, up to 200 characters
  long: field('long'),       // longer text, up to 2000 characters
  num: field('num'),         // a number of zero or more (money)
  int: field('int'),         // a whole number of zero or more
  date: field('date'),       // 'YYYY-MM-DD'
  time: field('time'),       // 'YYYY-MM-DDTHH:MM'
  enum: (col, label, values, options = {}) => ({ type: 'enum', col, label, values, ...options }),
  ref: (col, label, table, options = {}) => ({ type: 'ref', col, label, table, ...options }), // id of a row in another table
}

// ---------- Checking values ----------
export function isDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
}
const isTime = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) && isDate(v.slice(0, 10))

// Checks one value. Returns { value } or { error }.
function cleanValue(f, raw) {
  const blank = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')
  if (blank) {
    if (f.required) return { error: `${f.label} is required.` }
    return { value: 'blank' in f ? f.blank : null } // an empty optional value
  }

  switch (f.type) {
    case 'text':
    case 'long': {
      if (typeof raw !== 'string') return { error: `${f.label} must be text.` }
      const value = raw.trim()
      const max = f.max ?? (f.type === 'long' ? 2000 : 200)
      return value.length > max ? { error: `${f.label} is too long (most ${max} characters).` } : { value }
    }
    case 'num':
    case 'int': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
      if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: `${f.label} must be a number of 0 or more.` }
      if (f.type === 'int' && !Number.isInteger(n)) return { error: `${f.label} must be a whole number.` }
      return { value: n }
    }
    case 'date':
      return isDate(raw) ? { value: raw } : { error: `${f.label} must be a valid date.` }
    case 'time':
      return isTime(raw) ? { value: raw } : { error: `${f.label} must be a valid date and time.` }
    case 'enum':
      return f.values.includes(raw) ? { value: raw } : { error: `${f.label} must be one of: ${f.values.join(', ')}.` }
    case 'ref': {
      const found = typeof raw === 'string' && db.prepare(`SELECT 1 FROM ${f.table} WHERE id = ?`).get(raw)
      return found ? { value: raw } : { error: `${f.label} was not found.` }
    }
  }
}

// Checks a request body against a resource's fields.
// existing = null for a new record. Returns { values } (keys are the API names, values are ready
// for the database) or { error }. Unknown keys are ignored, so a client can never set a field
// the server manages itself (like billed).
export function cleanBody(spec, body, existing) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { error: 'The request could not be read.' }
  const values = {}
  for (const [key, f] of Object.entries(spec.fields)) {
    if (Object.hasOwn(body, key)) {
      const result = cleanValue(f, body[key])
      if (result.error) return { error: result.error }
      values[key] = result.value
    } else if (!existing) {
      // A new record: use the default, or complain if the field is required.
      if ('default' in f) values[key] = typeof f.default === 'function' ? f.default() : f.default
      else if (f.required) return { error: `${f.label} is required.` }
    }
  }
  return { values }
}

// ---------- Building what the server returns ----------
// A database row -> the object the React app uses. Empty values become '' and flags become true/false.
export function toApi(spec, row) {
  const out = { id: row.id }
  for (const [key, f] of Object.entries(spec.fields)) out[key] = row[f.col] ?? ''
  for (const [key, col] of Object.entries(spec.extra ?? {})) out[key] = key === 'billed' ? !!row[col] : row[col] ?? ''
  return out
}