import Axios from 'axios'

const api = Axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' }
})

// Kept in module memory so each browser tab has its own token.
// Reads localStorage once at page load; after that only setApiToken() updates it.
let _token = localStorage.getItem('token') || null

export function setApiToken(token) {
  _token = token || null
}

api.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`
  return config
})

api.interceptors.response.use((res) => res, (err) => {
  try {
    const status = err?.response?.status
    const url = err?.config?.url || ''

    // If it's a 401 Unauthorized error
    if (status === 401) {
      // Keep the user on the account security page so the validation message is visible.
      if (url.includes('/auth/change-password') || url.includes('/auth/account-security')) {
        return Promise.reject(err)
      }

      // For all other 401s (expired session, etc.), clear storage and redirect
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('permissions')
      window.location.href = '/login'
      return Promise.reject(err)
    }
  } catch (e) { 
    console.error('api response handler error', e) 
  }
  return Promise.reject(err)
})

export default api
