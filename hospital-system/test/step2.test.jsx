import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../src/context/DataContext'
import { AuthProvider } from '../src/context/AuthContext'
import App from '../src/App'
import { today } from '../src/utils'

const setup = (path = '/') => render(
  <MemoryRouter initialEntries={[path]}><DataProvider><AuthProvider><App /></AuthProvider></DataProvider></MemoryRouter>)

async function signIn(user, name) {
  await user.type(await screen.findByLabelText('Username'), name)
  await user.type(screen.getByLabelText('Password'), name + '123')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Dashboard', { selector: 'h1' })
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

test('book, block double-booking, track status, calendar, history, discharge', async () => {
  const user = userEvent.setup()
  setup()
  await signIn(user, 'admin')
  await user.click(screen.getByRole('link', { name: 'Appointments' }))

  const book = async (when) => {
    await user.click(screen.getByRole('button', { name: 'Add appointment' }))
    const dlg = screen.getByRole('dialog')
    await user.selectOptions(within(dlg).getByLabelText('Patient'), 'Nimali Fernando')
    await user.selectOptions(within(dlg).getByLabelText('Doctor'), 'Dr. Amara Perera')
    await user.type(within(dlg).getByLabelText('Date and time'), when)
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
  }
  const when = today() + 'T10:00'
  await book(when)
  await screen.findByText('Saved.')
  expect(screen.getByText('Scheduled')).toBeTruthy()

  await book(when) // same doctor, same time
  expect(await screen.findByText('That doctor already has an appointment at this time.')).toBeTruthy()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

  await user.click(screen.getByRole('button', { name: 'Check in' }))
  expect(await screen.findByText('Checked-in')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Complete' }))
  expect(await screen.findByText('Completed')).toBeTruthy()

  await user.click(screen.getByRole('button', { name: 'Calendar view' }))
  expect(await screen.findByText(/10:00 Nimali Fernando/)).toBeTruthy()

  await user.click(screen.getByRole('link', { name: 'Medical records' }))
  await user.click(screen.getByRole('button', { name: 'Add record' }))
  const dlg = screen.getByRole('dialog')
  await user.selectOptions(within(dlg).getByLabelText('Patient'), 'Nimali Fernando')
  await user.selectOptions(within(dlg).getByLabelText('Doctor'), 'Dr. Amara Perera')
  await user.type(within(dlg).getByLabelText('Diagnosis'), 'Viral fever')
  await user.type(within(dlg).getByLabelText(/Prescription notes/), 'Paracetamol 500 mg')
  await user.click(within(dlg).getByRole('button', { name: 'Save' }))
  await screen.findByText('Viral fever')

  await user.click(screen.getByRole('link', { name: 'Patients' }))
  const row = (await screen.findByText('Nimali Fernando')).closest('tr')
  await user.click(within(row).getByRole('button', { name: 'History' }))
  const hist = await screen.findByRole('dialog')
  expect(within(hist).getByText('Viral fever')).toBeTruthy()
  expect(within(hist).getByText(/Paracetamol 500 mg/)).toBeTruthy()
  await user.click(within(hist).getByRole('button', { name: 'Close' }))

  await user.click(screen.getByRole('link', { name: 'Admissions' }))
  await user.click(screen.getByRole('button', { name: 'Add admission' }))
  const a = screen.getByRole('dialog')
  await user.selectOptions(within(a).getByLabelText('Patient'), 'Kasun Silva')
  await user.type(within(a).getByLabelText('Ward'), 'Ward 3')
  await user.click(within(a).getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Admitted')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Discharge' }))
  expect(await screen.findByText('Discharged')).toBeTruthy()

  await user.click(screen.getByRole('link', { name: 'Dashboard' }))
  await screen.findByText("Today's appointments", { selector: 'a span' })
}, 30000)

test('receptionist cannot delete and does not see billing-type screens', async () => {
  const user = userEvent.setup()
  setup()
  await signIn(user, 'reception')
  expect(screen.queryByRole('link', { name: 'Medical records' })).toBeNull()
  await user.click(screen.getByRole('link', { name: 'Patients' }))
  await screen.findByText('Nimali Fernando')
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
})
