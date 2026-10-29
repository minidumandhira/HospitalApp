// The one place that talks to the back end. Every screen uses api.get / post / put / delete.

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// AuthContext sets this, so any "please sign in" answer sends the user back to the sign-in page.
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

async function request(method, path, body) {
  let response
  try {
    response = await fetch('/api' + path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Is it running?', 0)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    // The sign-in routes answer 401 for a wrong password. That is not a lost session.
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorized()
    throw new ApiError(data?.error ?? 'Something went wrong.', response.status)
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
}