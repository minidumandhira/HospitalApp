import { Router } from 'express'
import { db, newId } from '../db.js'
import { audit } from '../audit.js'
import { requireAuth } from '../auth.js'
import { cleanBody, toApi } from '../fields.js'
import { rowsFor } from '../listing.js'
import { RESOURCES } from '../resources.js'

// One set of routes serves every kind of record described in resources.js:
//   GET /api/patients      list          POST /api/patients       add
//   PUT /api/patients/:id  change        DELETE /api/patients/:id delete
const router = Router()

// Find the kind of record named in the URL. Unknown names fall through to the 404 answer.
function findResource(req, res, next) {
  if (!Object.hasOwn(RESOURCES, req.params.resource)) return next('route')
  req.spec = RESOURCES[req.params.resource]
  next()
}

const roleCan = (spec, kind, role) => (spec[kind] ?? (kind === 'remove' ? ['admin'] : [])).includes(role)
const forbidden = (res) => res.status(403).json({ error: 'You do not have permission to do that.' })
const getRow = (spec, id) => db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).get(id)
const withBlanks = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? '']))

// Turn a database refusal into a clear message for the user.
function databaseProblem(err, spec, res, deleting = false) {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: spec.uniqueMessage ?? 'That value is already in use.' })
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(409).json({ error: deleting ? 'Other records use this one, so it cannot be deleted.' : 'A linked record was not found.' })
  }
  if (err.code === 'SQLITE_CONSTRAINT_CHECK') return res.status(400).json({ error: 'One of the values is not allowed.' })
  throw err
}

// ----- List -----
router.get('/:resource', findResource, requireAuth, (req, res) => {
  const items = rowsFor(req.spec, req.user.role)
  if (!items) return forbidden(res)
  res.json(items)
})

// ----- Add -----
router.post('/:resource', findResource, requireAuth, (req, res) => {
  const { spec } = req
  if (!roleCan(spec, 'write', req.user.role)) return forbidden(res)

  const { values, error } = cleanBody(spec, req.body, null)
  if (error) return res.status(400).json({ error })
  const problem = spec.check?.(withBlanks(values), null)
  if (problem) return res.status(400).json({ error: problem })

  const id = newId()
  const keys = Object.keys(values)
  try {
    db.prepare(`INSERT INTO ${spec.table} (id, ${keys.map((k) => spec.fields[k].col).join(', ')})
                VALUES (?, ${keys.map(() => '?').join(', ')})`).run(id, ...keys.map((k) => values[k]))
  } catch (err) {
    return databaseProblem(err, spec, res)
  }
  audit(req.user.username, `Added ${spec.noun}`)
  res.status(201).json(toApi(spec, getRow(spec, id)))
})

// ----- Change -----
router.put('/:resource/:id', findResource, requireAuth, (req, res) => {
  const { spec } = req
  if (!roleCan(spec, 'write', req.user.role)) return forbidden(res)

  const row = getRow(spec, req.params.id)
  if (!row) return res.status(404).json({ error: 'That record was not found.' })
  const existing = toApi(spec, row)
  const frozen = spec.locked?.(existing)
  if (frozen) return res.status(409).json({ error: frozen })

  const { values, error } = cleanBody(spec, req.body, existing)
  if (error) return res.status(400).json({ error })
  const problem = spec.check?.({ ...existing, ...withBlanks(values) }, existing)
  if (problem) return res.status(400).json({ error: problem })

  const keys = Object.keys(values)
  try {
    if (keys.length) {
      db.prepare(`UPDATE ${spec.table} SET ${keys.map((k) => `${spec.fields[k].col} = ?`).join(', ')} WHERE id = ?`)
        .run(...keys.map((k) => values[k]), row.id)
    }
  } catch (err) {
    return databaseProblem(err, spec, res)
  }
  audit(req.user.username, `Updated ${spec.noun}`)
  res.json(toApi(spec, getRow(spec, row.id)))
})

// ----- Delete -----
router.delete('/:resource/:id', findResource, requireAuth, (req, res) => {
  const { spec } = req
  if (!roleCan(spec, 'remove', req.user.role)) return forbidden(res)

  const row = getRow(spec, req.params.id)
  if (!row) return res.status(404).json({ error: 'That record was not found.' })
  const frozen = (spec.lockedDelete ?? spec.locked)?.(toApi(spec, row))
  if (frozen) return res.status(409).json({ error: frozen })

  try {
    db.prepare(`DELETE FROM ${spec.table} WHERE id = ?`).run(row.id)
  } catch (err) {
    return databaseProblem(err, spec, res, true)
  }
  audit(req.user.username, `Deleted ${spec.noun}`)
  res.json({ ok: true })
})

export default router