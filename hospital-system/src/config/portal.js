
export const BOOKING = {
  noun: 'appointment',
  fields: [
    {
      key: 'doctor',
      label: 'Doctor',
      type: 'select',
      required: true,
      options: (db) => [
        ['', 'Select doctor'],
        ...db.doctors.map((d) => [d.id, `${d.name} · ${db.depts.find((x) => x.id === d.dept)?.name ?? ''}`]),
      ],
    },
    { key: 'when', label: 'Date and time', type: 'datetime-local', required: true },
    { key: 'reason', label: 'Reason for visit' },
  ],
}