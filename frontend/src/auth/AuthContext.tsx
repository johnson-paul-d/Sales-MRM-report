import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setToken, getToken } from '../api/client'
import type { Me } from '../api/types'

interface AuthCtx {
  user: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      if (getToken()) {
        try {
          setUser((await api.get<Me>('/auth/me')).data)
        } catch {
          setToken(null)
        }
      }
      setLoading(false)
    })()
  }, [])

  const login = async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password })
    const res = await api.post('/auth/login', body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    setToken(res.data.access_token)
    setUser((await api.get<Me>('/auth/me')).data)
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}
