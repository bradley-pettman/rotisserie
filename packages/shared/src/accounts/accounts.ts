import z from 'zod'
import type { InferSchemas } from '../lib/schemas'
import { HouseholdSchemas } from './households'

const Email = z.string().trim().toLowerCase().pipe(z.email().max(254))

const User = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string()
})

const Me = z.object({
  user: User,
  household: z
    .object({
      id: z.string(),
      name: z.string(),
      role: HouseholdSchemas.HouseholdRole
    })
    .nullable()
})

const AuthSession = z.object({
  token: z.string(),
  me: Me
})

const SignUpInput = z.object({
  email: Email,
  password: z.string().min(8, 'Use at least 8 characters').max(256),
  displayName: z.string().trim().min(1).max(100)
})

const SignInInput = z.object({
  email: Email,
  password: z.string().min(1).max(256)
})

export const AccountSchemas = {
  User,
  Me,
  AuthSession,
  SignUpInput,
  SignInInput
}

export type AccountSchemas = InferSchemas<typeof AccountSchemas>
