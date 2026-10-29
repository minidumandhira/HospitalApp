import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../src/context/DataContext'
import { AuthProvider } from '../src/context/AuthContext'
import App from '../src/App'

const setup = () => render(
  <MemoryRouter><DataProvider><AuthProvider><App /></AuthProvider></DataProvider></MemoryRouter>)
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

async function signIn(user, name) {
  await user.type(await screen.findByLabelText('Username'), name)
  await user.type(screen.getByLabelText('Password'), name + '123')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('link', { name: 'Sign out' })
}
const go = (user, name) => user.click(screen.getByRole('link', { name }))
const rowOf = async (text) => (await screen.findByText(text)).closest('tr')
const dialog = () => screen.getByRole('dialog')

async function addRecord(user, { med, qty }) {
  await go(user, 'Medical records')
  await user.click(screen.getByRole('button', { name: 'Add record' }))
  const d = dialog()
  await user.selectOptions(within(d).getByLabelText('Patient'), 'Nimali Fernando')
  await user.selectOptions(within(d).getByLabelText('Doctor'), 'Dr. Amara Perera')
  await user.type(within(d).getByLabelText('Diagnosis'), 'Test case')
  await user.selectOptions(within(d).getByLabelText(/Prescribed medicine/), med)
  if (qty) await user.type(within(d).getByLabelText('Quantity'), String(qty))
  await user.click(within(d).getByRole('button', { name: 'Save' }))
}

test('laboratory: request, collect sample, enter result, report', async () => {
  const user = userEvent.setup()
  setup(); await signIn(user, 'admin'); await go(user, 'Laboratory')
  await user.click(screen.getByRole('button', { name: 'Add test request' }))
  let d = dialog()
  await user.selectOptions(within(d).getByLabelText('Patient'), 'Nimali Fernando')
  await user.type(within(d).getByLabelText('Test'), 'Full blood count')
  await user.type(within(d).getByLabelText(/Charge/), '1500')
  await user.click(within(d).getByRole('button', { name: 'Save' }))
  expect(within(await rowOf('Full blood count')).getByText('Requested')).toBeTruthy()

  await user.click(screen.getByRole('button', { name: 'Collect sample' }))
  expect(within(await rowOf('Full blood count')).getByText('Sample collected')).toBeTruthy()

  await user.click(screen.getByRole('button', { name: 'Enter result' }))
  await user.type(within(dialog()).getByLabelText('Result'), 'Hb 12.5 g/dL')
  await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
  expect(within(await rowOf('Full blood count')).getByText('Completed')).toBeTruthy()

  await user.click(screen.getByRole('button', { name: 'Report' }))
  d = dialog()
  expect(within(d).getByText('Hb 12.5 g/dL')).toBeTruthy()
  expect(within(d).getByRole('button', { name: 'Print report' })).toBeTruthy()
}, 30000)

test('pharmacy: alerts, restock, dispense reduces stock, blocks bad dispensing', async () => {
  const user = userEvent.setup()
  setup(); await signIn(user, 'admin'); await go(user, 'Pharmacy stock')

  const amox = await rowOf('Amoxicillin 250 mg')
  expect(within(amox).getByText('Low stock')).toBeTruthy()
  expect(within(amox).getByText('Expires soon')).toBeTruthy()

  await user.click(within(amox).getByRole('button', { name: 'Restock' }))
  await user.type(within(dialog()).getByLabelText('Quantity received'), '100')
  await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
  const after = await rowOf('Amoxicillin 250 mg')
  expect(within(after).getByText('140')).toBeTruthy()
  expect(within(after).queryByText('Low stock')).toBeNull()

  // an expired batch
  await user.click(screen.getByRole('button', { name: 'Add medicine' }))
  await user.type(within(dialog()).getByLabelText('Medicine'), 'Old syrup')
  await user.type(within(dialog()).getByLabelText('Stock'), '5')
  await user.type(within(dialog()).getByLabelText('Expiry date'), '2020-01-01')
  await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
  expect(within(await rowOf('Old syrup')).getByText('Expired')).toBeTruthy()

  // a prescription must have a quantity
  await go(user, 'Medical records')
  await user.click(screen.getByRole('button', { name: 'Add record' }))
  const d = dialog()
  await user.selectOptions(within(d).getByLabelText('Patient'), 'Nimali Fernando')
  await user.selectOptions(within(d).getByLabelText('Doctor'), 'Dr. Amara Perera')
  await user.type(within(d).getByLabelText('Diagnosis'), 'x')
  await user.selectOptions(within(d).getByLabelText(/Prescribed medicine/), 'Atorvastatin 20 mg')
  await user.click(within(d).getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Enter a quantity for the prescribed medicine.')).toBeTruthy()
  await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))

  await addRecord(user, { med: 'Atorvastatin 20 mg', qty: 10 })
  await addRecord(user, { med: 'Amoxicillin 250 mg', qty: 500 })
  await addRecord(user, { med: 'Old syrup', qty: 1 })

  await go(user, 'Prescriptions')
  const dispenseFor = async (medName) => {
    const row = (await screen.findAllByText(medName)).map((n) => n.closest('tr')).find(Boolean)
    await user.click(within(row).getByRole('button', { name: 'Dispense' }))
  }
  await dispenseFor('Atorvastatin 20 mg')
  expect(await screen.findByText('Dispensed 10 × Atorvastatin 20 mg.')).toBeTruthy()
  await dispenseFor('Amoxicillin 250 mg')
  expect(await screen.findByText('Only 140 of Amoxicillin 250 mg in stock.')).toBeTruthy()
  await dispenseFor('Old syrup')
  expect(await screen.findByText('Old syrup has expired. Do not dispense it.')).toBeTruthy()

  await go(user, 'Pharmacy stock')
  expect(within(await rowOf('Atorvastatin 20 mg')).getByText('140')).toBeTruthy() // 150 - 10
}, 40000)

test('lab and pharmacy staff see only their own screens', async () => {
  const user = userEvent.setup()
  setup(); await signIn(user, 'lab')
  expect(screen.getByRole('link', { name: 'Laboratory' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Pharmacy stock' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Patients' })).toBeNull()
  await user.click(screen.getByRole('link', { name: 'Sign out' }))

  await signIn(user, 'pharmacy')
  expect(screen.getByRole('link', { name: 'Pharmacy stock' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Prescriptions' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Laboratory' })).toBeNull()
  expect(await screen.findByText(/Amoxicillin 250 mg — Low stock/)).toBeTruthy() // dashboard alert
})
