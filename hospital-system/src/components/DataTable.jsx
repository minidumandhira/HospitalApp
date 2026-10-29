import { useData } from '../context/DataContext'
import { labelOf } from '../utils'

// Text shown in one table cell.
export function cellText(module, row, key, db) {
  const extra = module.extra?.find((e) => e.key === key)
  if (extra) return extra.value(row)
  const f = module.fields.find((x) => x.key === key)
  const v = row[key]
  if (!f) return v ?? ''
  if (f.type === 'select') return labelOf(f, v, db)
  if (f.type === 'datetime-local' && v) return v.replace('T', ' ')
  if (f.money && v !== '' && v != null) return 'Rs ' + Number(v).toLocaleString()
  return v ?? ''
}

// Generic table.
// actions(row) returns extra buttons for that row: [{ label, onClick }].
export default function DataTable({ module, rows, onEdit, onDelete, actions }) {
  const { db } = useData()
  const head = (key) =>
    module.fields.find((f) => f.key === key)?.label ?? module.extra?.find((e) => e.key === key)?.label ?? key

  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {module.columns.map((c) => <th key={c}>{head(c)}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {module.columns.map((c) => {
                const text = cellText(module, row, c, db)
                return (
                  <td key={c}>
                    {c === 'status' && text ? (
                      <span className={'b s-' + text.replace(/\W/g, '')}>{text}</span>
                    ) : c === 'alerts' ? (
                      text
                        ? text.split(', ').map((t) => (
                            <span key={t} className={'b ' + (t === 'Expired' ? 's-Cancelled' : 's-Pending')}>{t}</span>
                          ))
                        : <span className="mu">OK</span>
                    ) : text}
                  </td>
                )
              })}
              <td className="ac">
                {actions?.(row).map((a) => (
                  <button key={a.label} onClick={a.onClick}>{a.label}</button>
                ))}
                <button onClick={() => onEdit(row)}>{module.editLabel || 'Edit'}</button>
                {onDelete && <button className="dg" onClick={() => onDelete(row)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
