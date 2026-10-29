

export const rs = (n) => 'Rs ' + Number(n).toLocaleString()

export const paidOf = (bill) => bill.pay.reduce((sum, p) => sum + p.a, 0)
export const balanceOf = (bill) => bill.total - paidOf(bill)

export function billStatus(bill) {
  const paid = paidOf(bill)
  return paid >= bill.total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
}


export function unbilledCharges(db, patientId) {
  const items = []

  db.appts
    .filter((a) => a.patient === patientId && a.status === 'Completed' && !a.billed)
    .forEach((a) => {
      const doctor = db.doctors.find((d) => d.id === a.doctor)
      items.push({ text: 'Consultation – ' + (doctor?.name ?? 'doctor'), amount: Number(doctor?.fee) || 0, source: 'appts', id: a.id })
    })

  db.labs
    .filter((l) => l.patient === patientId && l.status === 'Completed' && !l.billed)
    .forEach((l) => items.push({ text: 'Laboratory – ' + l.test, amount: Number(l.price) || 0, source: 'labs', id: l.id }))

  db.records
    .filter((r) => r.patient === patientId && r.disp && !r.billed)
    .forEach((r) => {
      const med = db.meds.find((m) => m.id === r.med)
      items.push({ text: `Pharmacy – ${med?.name ?? 'medicine'} × ${r.qty}`, amount: r.cost, source: 'records', id: r.id })
    })

  db.adm
    .filter((a) => a.patient === patientId && a.out && !a.billed)
    .forEach((a) => {
      const days = Math.max(1, Math.round((new Date(a.out) - new Date(a.ad)) / 864e5))
      items.push({ text: `Admission – ${days} day(s)`, amount: days * (Number(a.rate) || 0), source: 'adm', id: a.id })
    })

  return items
}