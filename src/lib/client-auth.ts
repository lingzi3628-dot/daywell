// Authentication is carried only by the HttpOnly, same-site session cookie.
// Never copy session credentials into JavaScript-accessible storage.
export function authFetch(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: "same-origin" });
}
