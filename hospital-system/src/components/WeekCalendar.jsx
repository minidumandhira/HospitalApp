import { useState } from 'react'
import { useData } from '../context/DataContext'
import { labelOf, localDate, today } from '../utils'
import { MODULES } from '../config/modules'

// Seven-day view of appointments. Click one to reschedule it.
export default function WeekCalendar({ appts, onSelect }) {
  const { db } = useData()
  const [offset, setOffset] = useState(0) // weeks away from the current week

  const sunday = new Date()
  sunday.setDate(sunday.getDate() - sunday.getDay() + offset * 7)
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return localDate(d)
  })

  const fields = MODULES.appts.fields
  const name = (key, value) => labelOf(fields.find((f) => f.key === key), value, db)

  return (
    <>
      <div className="row cal-head">
        <button onClick={() => setOffset(offset - 1)}>Previous week</button>
        <button onClick={() => setOffset(0)}>This week</button>
        <button onClick={() => setOffset(offset + 1)}>Next week</button>
        <b>{days[0]} to {days[6]}</b>
      </div>
      <div className="grid7">
        {days.map((day) => {
          const list = appts
            .filter((a) => a.when.slice(0, 10) === day && a.status !== 'Cancelled')
            .sort((a, b) => (a.when < b.when ? -1 : 1))
          const label = new Date(day + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
          return (
            <div key={day} className={'day' + (day === today() ? ' now' : '')}>
              <h4>{label}</h4>
              {list.length === 0 && <small className="mu">Free</small>}
              {list.map((a) => (
                <button key={a.id} className="ev" onClick={() => onSelect(a)}>
                  <b>{a.when.slice(11)} {name('patient', a.patient)}</b>
                  <small>{name('doctor', a.doctor)}</small>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
