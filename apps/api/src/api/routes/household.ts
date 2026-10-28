import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  ChangeMemberRole,
  CreateHousehold,
  CreateInvite,
  DeleteHousehold,
  GetHousehold,
  JoinHousehold,
  ListInvites,
  RemoveMember,
  RenameHousehold,
  RevokeInvite
} from '~/use-cases/households'
import { requireMember, requireUser } from '../auth'
import { rejectInvalid } from '../errors'

export const household = new Hono()
  .post('/', requireUser, zValidator('json', CreateHousehold.input, rejectInvalid), async (c) => {
    return c.json(await CreateHousehold(c.req.valid('json'), c.var.user), 201)
  })
  .post('/join', requireUser, zValidator('json', JoinHousehold.input, rejectInvalid), async (c) => {
    return c.json(await JoinHousehold(c.req.valid('json'), c.var.user))
  })
  .get('/', requireMember, async (c) => {
    return c.json(await GetHousehold({}, c.var.member))
  })
  .patch('/', requireMember, zValidator('json', RenameHousehold.input, rejectInvalid), async (c) => {
    return c.json(await RenameHousehold(c.req.valid('json'), c.var.member))
  })
  .delete('/', requireMember, async (c) => {
    await DeleteHousehold({}, c.var.member)
    return c.body(null, 204)
  })
  .get('/invites', requireMember, async (c) => {
    return c.json(await ListInvites({}, c.var.member))
  })
  .post('/invites', requireMember, async (c) => {
    return c.json(await CreateInvite({}, c.var.member), 201)
  })
  .delete('/invites/:id', requireMember, zValidator('param', RevokeInvite.input, rejectInvalid), async (c) => {
    await RevokeInvite(c.req.valid('param'), c.var.member)
    return c.body(null, 204)
  })
  .patch(
    '/members/:userId',
    requireMember,
    zValidator('param', ChangeMemberRole.input.pick({ userId: true }), rejectInvalid),
    zValidator('json', ChangeMemberRole.input.omit({ userId: true }), rejectInvalid),
    async (c) => {
      return c.json(await ChangeMemberRole({ ...c.req.valid('json'), ...c.req.valid('param') }, c.var.member))
    }
  )
  .delete('/members/:userId', requireMember, zValidator('param', RemoveMember.input, rejectInvalid), async (c) => {
    await RemoveMember(c.req.valid('param'), c.var.member)
    return c.body(null, 204)
  })
