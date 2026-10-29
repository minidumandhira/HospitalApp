import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { today } from '../utils'

const rs = (n) => 'Rs ' + Number(n).toLocaleString()

// Patients have their own portal, so they never see this page.
export default function Dashboard() {
  const { user } = useAuth()
  return user.role === 'patient' ? <Navigate to="/my" replace /> : <StaffDashboard />
}

// The numbers come from the server, which sends each role only the parts it may see.
function StaffDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="err" role="alert">{error}</p>
  if (!data) return <p className="mu">Loading…</p>

  const tiles = [
    data.patients !== undefined && { label: 'Total patients', value: data.patients, to: '/patients' },
    data.today && { label: "Today's appointments", value: data.today.count, to: '/appts' },
    data.admitted !== undefined && { label: 'Currently admitted', value: data.admitted, to: '/adm' },
    data.openLabs !== undefined && { label: 'Open lab requests', value: data.openLabs, to: '/labs' },
    data.pharmacyAlerts && { label: 'Pharmacy alerts', value: data.pharmacyAlerts.length, to: '/meds' },
    data.revenue !== undefined && { label: 'Revenue collected', value: rs(data.revenue), to: '/bills' },
    data.outstanding !== undefined && { label: 'Outstanding', value: rs(data.outstanding), to: '/bills' },
    data.doctors !== undefined && { label: 'Doctors', value: data.doctors, to: '/doctors' },
  ].filter(Boolean)

  return (
    <>
      <header><h1>Dashboard</h1><span className="mu">{today()}</span></header>

      {tiles.length ? (
        <section className="mon">
          {tiles.map((t) => (
            <Link key={t.label} to={t.to}><span>{t.label}</span><b>{t.value}</b></Link>
          ))}
        </section>
      ) : (
        <p className="empty">Your role has no summary tiles.</p>
      )}

      {data.today && (
        <>
          <h3>Today's appointments</h3>
          {data.today.list.length ? (
            <ul>
              {data.today.list.map((a) => (
                <li key={a.id}>
                  {a.time} — {a.patientName} with {a.doctorName}{' '}
                  <span className={'b s-' + a.status.replace(/\W/g, '')}>{a.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mu">No appointments today.</p>
          )}
        </>
      )}

      {data.pharmacyAlerts && (
        <>
          <h3>Pharmacy alerts</h3>
          {data.pharmacyAlerts.length ? (
            <ul>{data.pharmacyAlerts.map((a) => <li key={a}>{a}</li>)}</ul>
          ) : (
            <p className="mu">Stock levels and expiry dates are fine.</p>
          )}
        </>
      )}
    </>
  )
}