import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import api from '../utils/axios'
import { socket } from '../utils/socket'
import { jwtDecode } from 'jwt-decode'

const AUTH_PAGES = ['/login', '/register']

export const redirectToLogin = () => {
  if (!AUTH_PAGES.includes(window.location.pathname)) {
    window.location.href = '/login'
  }
}

// The backend rejects expired/invalid tokens with these codes (REST body.code, socket err.data.code).
const isAuthFailure = (code, message = '') =>
  code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID' || /Authentication error/i.test(message)

// Logs the user out the moment the JWT expires instead of waiting for the next
// request to fail with "jwt expired". setTimeout caps at ~24.8 days, so re-check on fire.
let expiryTimer = null
const clearExpiryTimer = () => {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
}
const scheduleExpiryLogout = (token) => {
  clearExpiryTimer()
  if (!token) return
  let expMs
  try {
    expMs = jwtDecode(token).exp * 1000
  } catch {
    return
  }
  const wait = Math.min(Math.max(expMs - Date.now(), 0), 2 ** 31 - 1)
  expiryTimer = setTimeout(() => {
    const state = useAuthStore.getState()
    if (state.isTokenExpired(state.token)) {
      state.logout()
      redirectToLogin()
    } else {
      scheduleExpiryLogout(state.token)
    }
  }, wait)
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      hasHydrated: false,

      isTokenExpired: (token) => {
        if (!token) return true
        try {
          const decoded = jwtDecode(token)
          return decoded.exp * 1000 < Date.now()
        } catch {
          return true
        }
      },

      login: async (email, password) => {
        try {
          const response = await api.post('/users/login', { email, password })
          const { user, accessToken } = response.data.data

          set({
            user,
            token: accessToken,
            isAuthenticated: true,
          })

          scheduleExpiryLogout(accessToken)
          if (!socket.connected) socket.connect()

          return { success: true }
        } catch (error) {
          const msg = error?.response?.data?.message || error.message || "Invalid credentials"
          console.error("Login client error:", msg)
          return { success: false, error: msg }
        }
      },

      register: async (formData) => {
        try {
          await api.post('/users/register', formData)
          return { success: true }
        } catch (error) {
          return {
            success: false,
            error: error?.response?.data?.message || "Registration failed."
          }
        }
      },

      // Runs on app mount. Synchronously validates the persisted token.
      restoreSession: () => {
        const { token, isTokenExpired } = get()

        if (!token || isTokenExpired(token)) {
          // Token missing or expired — clear silently, no API call
          set({ user: null, token: null, isAuthenticated: false })
          return false
        }

        scheduleExpiryLogout(token)
        if (!socket.connected) socket.connect()
        return true
      },

      setHasHydrated: (v) => set({ hasHydrated: v }),

      logout: () => {
        clearExpiryTimer()
        // Always disconnect: a socket stuck in a reconnect loop is not "connected"
        // but would keep retrying with the dead token.
        socket.disconnect()
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        })
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

// Resolve the token at (re)connect time so reconnects never reuse a stale token.
socket.auth = (cb) => cb({ token: useAuthStore.getState().token })

socket.on('connect_error', (err) => {
  if (isAuthFailure(err?.data?.code, err?.message)) {
    console.warn('🔒 Socket auth rejected — logging out:', err.message)
    useAuthStore.getState().logout()
    redirectToLogin()
  }
})
