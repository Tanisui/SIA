import Axios from 'axios'

const api = Axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use((res) => res, (err) => {
  try{
    const status = err?.response?.status
    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('permissions')
      window.location.href = '/login'
      return Promise.reject(err)
    }
  }catch(e){ console.error('api response handler error', e) }
  return Promise.reject(err)
})

export default api
