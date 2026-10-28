import { AccountSchemas } from '@rotisserie/shared/accounts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import z from 'zod'
import { api, ApiError, onSessionError, setSessionToken } from './client'
import { loadToken, saveToken } from './session'

export type Me = AccountSchemas['Me']
export type SignInInput = z.input<typeof AccountSchemas.SignInInput>
export type SignUpInput = z.input<typeof AccountSchemas.SignUpInput>

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'signedIn'; me: Me }

export type Auth = AuthState & {
  signIn: (input: SignInInput) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  leftHousehold: () => Promise<void>
}

const meKey = ['me'] as const

const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (auth === null) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}

export function useMe(): Me | null {
  const auth = useAuth()
  return auth.status === 'signedIn' ? auth.me : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    loadToken().then(
      (stored) => {
        setSessionToken(stored)
        setToken(stored)
      },
      () => setToken(null)
    )
  }, [])

  const me = useQuery({
    queryKey: meKey,
    queryFn: () => api.get(AccountSchemas.Me, '/me'),
    enabled: typeof token === 'string',
    staleTime: Infinity,
    retry: (failures, error) => !(error instanceof ApiError && error.status === 401) && failures < 2
  })

  const adopt = useCallback(async (next: string | null) => {
    setSessionToken(next)
    await saveToken(next)
    setToken(next)
  }, [])

  const signOutLocally = useCallback(async () => {
    await adopt(null)
    queryClient.clear()
  }, [adopt, queryClient])

  const refresh = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: meKey })
  }, [queryClient])

  const leftHousehold = useCallback(async () => {
    await refresh()
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meKey[0] })
  }, [queryClient, refresh])

  useEffect(
    () => onSessionError((code) => void (code === 'unauthenticated' ? signOutLocally() : leftHousehold())),
    [signOutLocally, leftHousehold]
  )

  const start = useCallback(
    async (session: AccountSchemas['AuthSession']) => {
      queryClient.clear()
      queryClient.setQueryData(meKey, session.me)
      await adopt(session.token)
    },
    [adopt, queryClient]
  )

  const state: AuthState =
    token === undefined
      ? { status: 'loading' }
      : token === null
        ? { status: 'signedOut' }
        : me.data
          ? { status: 'signedIn', me: me.data }
          : me.isError
            ? { status: 'error', error: me.error, retry: () => void me.refetch() }
            : { status: 'loading' }

  const auth: Auth = {
    ...state,
    signIn: async (input) => start(await api.post(AccountSchemas.AuthSession, '/auth/sign-in', input)),
    signUp: async (input) => start(await api.post(AccountSchemas.AuthSession, '/auth/sign-up', input)),
    signOut: async () => {
      await api.post(z.null(), '/auth/sign-out', undefined).catch(() => null)
      await signOutLocally()
    },
    refresh,
    leftHousehold
  }

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
