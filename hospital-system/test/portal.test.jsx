import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../src/context/DataContext'
import { AuthProvider } from '../src/context/AuthContext'
import App from '../src/App'
import { localDate } from '../src/utils'

const setup = () => render(
  <MemoryRouter><DataProvider><AuthProvider><App /></AuthProvider></DataProvider></MemoryRouter>)
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

const tomorrow = () => localDate(new Date(Date.now() + 864e5)) + 'T09:30'

async function signUp(user, name, username) {
  await user.click(await screen.findByRole('button', { name: 'New patient? Create an account' }))
  await user.type(screen.getByLabelText('Full name'), name)
  await user.type(screen.getByLabelText('Date of birth'), '1990-05-05')
  await user.type(screen.getByLabelText('Phone'), '0771110000')
  await user.type(screen.getByLabelText('Username'), username)
  await user.type(screen.getByLabelText(/Password/), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByText('My appointments', { selector: 'h1' })
}
async function bookIt(user) {
  await user.click(screen.getByRole('button', { name: 'Book appointment' }))
  const dlg = screen.getByRole('dialog')
  await user.selectOptions(within(dlg).getByLabelText('Doctor'), 'Dr. Amara Perera · General Medicine')
  await user.type(within(dlg).getByLabelText('Date and time'), tomorrow())
  await user.click(within(dlg).getByRole('button', { name: 'Save' }))
}

test('patients sign up, see only their own appointments, cannot double-book, can cancel', async () => {
  const user = userEvent.setup()
  setup()
  await signUp(user, 'Tharindu Perera', 'tharindu')
  expect(screen.queryByRole('link', { name: 'Patients' })).toBeNull()      // no staff screens
  expect(screen.getByText(/no appointments yet/)).toBeTruthy()

  await bookIt(user)
  expect(await screen.findByText('Scheduled')).toBeTruthy()

  await user.click(screen.getByRole('link', { name: 'Sign out' }))
  await signUp(user, 'Sanduni Rajapaksa', 'sanduni')
  expect(screen.getByText(/no appointments yet/)).toBeTruthy()             // cannot see Tharindu's
  await bookIt(user)                                                       // same slot
  expect(await screen.findByText('That time is not available. Please choose another time.')).toBeTruthy()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

  await user.click(screen.getByRole('link', { name: 'Sign out' }))
  await user.type(await screen.findByLabelText('Username'), 'tharindu')
  await user.type(screen.getByLabelText('Password'), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('My appointments', { selector: 'h1' })
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Yes, cancel it' }))
  expect(await screen.findByText('Cancelled')).toBeTruthy()
  await user.click(screen.getByRole('link', { name: 'My health record' }))
  await screen.findByText('My health record', { selector: 'h1' })
}, 30000)

test('demo patient login works and staff do not get portal screens', async () => {
  const user = userEvent.setup()
  setup()
  await user.type(await screen.findByLabelText('Username'), 'patient')
  await user.type(screen.getByLabelText('Password'), 'patient123')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('My appointments', { selector: 'h1' })
  await user.click(screen.getByRole('link', { name: 'Sign out' }))

  await user.type(await screen.findByLabelText('Username'), 'admin')
  await user.type(screen.getByLabelText('Password'), 'admin123')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Dashboard', { selector: 'h1' })
  expect(screen.queryByRole('link', { name: 'My appointments' })).toBeNull()
})
