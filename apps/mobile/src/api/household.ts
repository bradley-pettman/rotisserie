import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { api } from './client'

export type Household = HouseholdSchemas['Household']
export type HouseholdMember = HouseholdSchemas['HouseholdMember']
export type HouseholdInvite = HouseholdSchemas['HouseholdInvite']
export type HouseholdRole = HouseholdSchemas['HouseholdRole']

const keys = {
  household: ['household'] as const,
  invites: ['household', 'invites'] as const
}

export function useHousehold() {
  return useQuery({
    queryKey: keys.household,
    queryFn: () => api.get(HouseholdSchemas.Household, '/household')
  })
}

export function useInvites(enabled: boolean) {
  return useQuery({
    queryKey: keys.invites,
    queryFn: () => api.get(HouseholdSchemas.HouseholdInvite.array(), '/household/invites'),
    enabled
  })
}

export function useCreateHousehold() {
  const { refresh } = useAuth()
  return useMutation({
    mutationFn: (name: string) => api.post(HouseholdSchemas.Household, '/household', { name }),
    onSuccess: refresh
  })
}

export function useJoinHousehold() {
  const { refresh } = useAuth()
  return useMutation({
    mutationFn: (code: string) => api.post(HouseholdSchemas.Household, '/household/join', { code }),
    onSuccess: refresh
  })
}

export function useRenameHousehold() {
  const queryClient = useQueryClient()
  const { refresh } = useAuth()
  return useMutation({
    mutationFn: (name: string) => api.patch(HouseholdSchemas.Household, '/household', { name }),
    onSuccess: (household) => {
      queryClient.setQueryData(keys.household, household)
      return refresh()
    }
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(HouseholdSchemas.HouseholdInvite, '/household/invites', undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invites })
  })
}

export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/household/invites/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invites })
  })
}

export function useChangeRole() {
  const queryClient = useQueryClient()
  const { refresh } = useAuth()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: HouseholdRole }) =>
      api.patch(HouseholdSchemas.Household, `/household/members/${userId}`, { role }),
    onSuccess: (household) => {
      queryClient.setQueryData(keys.household, household)
      return refresh()
    }
  })
}

export function useRemoveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/household/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.household })
  })
}

export function useLeaveHousehold() {
  const { leftHousehold } = useAuth()
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/household/members/${userId}`),
    onSuccess: leftHousehold
  })
}

export function useDeleteHousehold() {
  const { leftHousehold } = useAuth()
  return useMutation({
    mutationFn: () => api.delete('/household'),
    onSuccess: leftHousehold
  })
}
