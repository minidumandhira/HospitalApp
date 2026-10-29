import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, login, register, notice } = useAuth()
  const [signup, setSignup] = useState(false) // false = sign in, true = patient sign up
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget))
    setBusy(true)
    setError(signup
      ? await register({ name: f.name, dob: f.dob, phone: f.phone, username: f.u, password: f.p })
      : await login(f.u, f.p))
    setBusy(false)
  }

  const message = error || notice

  return (
    <div className="lg">
      <div className="lgl">
        <h1>Hospital Management System</h1>
        <p>Patients, appointments, laboratory, pharmacy and billing in one place.</p>
        <svg className="ecg" viewBox="0 0 400 80" aria-hidden="true">
          <path pathLength="1" d="M0 40H120l10-6 8 6h20l8-34 12 68 10-34h30l10-8 10 8H400" />
        </svg>
      </div>
      <form onSubmit={submit} key={signup ? 'signup' : 'signin'}>
        <h2>{signup ? 'Create a patient account' : 'Sign in'}</h2>
        {message && <p className="err" role="alert">{message}</p>}
        {signup && (
          <>
            <label>Full name<input name="name" autoComplete="name" required /></label>
            <label>Date of birth<input name="dob" type="date" required /></label>
            <label>Phone<input name="phone" type="tel" autoComplete="tel" required /></label>
          </>
        )}
        <label>Username<input name="u" autoComplete="username" required /></label>
        <label>
          Password{signup && ' (at least 6 characters)'}
          <input name="p" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required />
        </label>
        <button className="pri" disabled={busy}>{signup ? 'Create account' : 'Sign in'}</button>
        <button type="button"  className="bt1" onClick={() => { setSignup(!signup); setError('') }}>
          {signup ? 'Back to sign in' : 'New patient? Create an account'}
        </button>
        {!signup && (
          <p className="hint">
            Demo accounts: admin, doctor, nurse, reception, lab, pharmacy, accounts, patient.
            The password is the username followed by 123.
          </p>
        )}
      </form>
    </div>
  )
}
