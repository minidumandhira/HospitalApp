// Small helpers shared across the app.

export const newId = () => Math.random().toString(36).slice(2, 8)

// Local date/time as text: "2026-10-15 14:30"
export const now = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')

export const today = () => now().slice(0, 10)

// A Date object as local "YYYY-MM-DD" (toISOString alone would use UTC and can show the wrong day).
export const localDate = (d) =>
  new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)

// SHA-256 hash for passwords (demo only: real systems hash on the server).
export async function hash(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return 'p:' + btoa(text)
  }
}

// Field helpers. A select field's options can be a list or a function of the data.
export function optionsOf(field, db) {
  const raw = typeof field.options === 'function' ? field.options(db) : field.options || []
  return raw.map((o) => (Array.isArray(o) ? o : [o, o]))
}

export function labelOf(field, value, db) {
  if (!value) return ''
  const hit = optionsOf(field, db).find(([v]) => v === value)
  return hit ? hit[1] : value
}

// Pharmacy warnings for one medicine: low stock, expired, or expiring within 60 days.
export function stockAlerts(med) {
  const alerts = []
  if (Number(med.stock) <= Number(med.reorder || 0)) alerts.push('Low stock')
  const soon = localDate(new Date(Date.now() + 60 * 864e5))
  if (med.expiry && med.expiry < today()) alerts.push('Expired')
  else if (med.expiry && med.expiry <= soon) alerts.push('Expires soon')
  return alerts
}
