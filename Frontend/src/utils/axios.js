import axios from 'axios'
import { useAuthStore, redirectToLogin } from '../store/authStore'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  withCredentials: false,
})

api.interceptors.request.use((config) => {
  const { token, isTokenExpired, logout } = useAuthStore.getState()
  if (token) {
    // Don't send a token we already know is expired; log out instead of surfacing "jwt expired".
    if (isTokenExpired(token)) {
      logout()
      redirectToLogin()
      return Promise.reject(new axios.Cancel('Session expired. Please log in again.'))
    }
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { logout } = useAuthStore.getState()
      logout()
      redirectToLogin()
    }
    return Promise.reject(error)
  }
)

export default api