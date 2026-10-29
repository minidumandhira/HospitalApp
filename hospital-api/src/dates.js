// Today's date on the server, as 'YYYY-MM-DD' in local time.
export const today = () => daysFromToday(0)

// A date n days from today (negative n = in the past).
export function daysFromToday(n) {
  const d = new Date(Date.now() + n * 864e5)
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}

// Right now, as 'YYYY-MM-DDTHH:MM' in local time (the same format appointments use).
export const nowLocal = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)