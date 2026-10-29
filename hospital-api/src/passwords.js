import bcrypt from 'bcryptjs'

const COST = 10 // how slow each hash is on purpose. Higher is safer but slower.

export const hashPassword = (password) => bcrypt.hash(password, COST)
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash)

// Used when the username does not exist, so a wrong username takes as long as a wrong password.
// That stops attackers from telling which usernames are real by timing the response.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST)

// Returns an error message, or '' when the password is acceptable.
export function checkPasswordRule(password, username = '') {
  if (typeof password !== 'string' || !password) return 'Enter a password.'
  if (password.length < 8) return 'Use a password of at least 8 characters.'
  if (Buffer.byteLength(password) > 72) return 'Use a password of at most 72 characters.' // bcrypt reads 72 bytes
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.'
  if (username && password.toLowerCase().includes(username.toLowerCase()))
    return 'The password must not contain your username.'
  return ''
}