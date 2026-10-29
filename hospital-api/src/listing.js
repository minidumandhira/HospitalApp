import { db } from './db.js'
import { toApi } from './fields.js'

// The rows of one kind of record that this role may see.
// Returns null when the role may not see this kind of record at all.
export function rowsFor(spec, role) {
  const full = spec.read?.includes(role)
  const basic = !full && spec.basic?.includes(role)
  if (!full && !basic) return null

  const items = db.prepare(`SELECT * FROM ${spec.table} ORDER BY ${spec.order ?? 'rowid'}`).all().map((row) => toApi(spec, row))
  if (basic) return items.map(({ id, name }) => ({ id, name }))     // only what this role needs
  return spec.decorate ? spec.decorate(items) : items
}