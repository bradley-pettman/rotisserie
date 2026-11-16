import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  AddMealsToGroceryList,
  DeleteCheckedGroceryItems,
  DeleteGroceryItem,
  DeleteGroceryStore,
  GetGroceryList,
  PreviewMealGroceries,
  ResolveGroceryAlert,
  UncheckAllGroceryItems,
  UpsertGroceryItem,
  UpsertGroceryStore
} from '~/use-cases/groceries'
import { requireMember } from '../auth'
import { rejectInvalid } from '../errors'

export const groceryList = new Hono()
  .get('/', requireMember, async (c) => {
    return c.json(await GetGroceryList({}, c.var.member))
  })
  .put(
    '/items/:id',
    requireMember,
    zValidator('param', UpsertGroceryItem.input.pick({ id: true }), rejectInvalid),
    zValidator('json', UpsertGroceryItem.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await UpsertGroceryItem({ ...c.req.valid('json'), ...c.req.valid('param') }, c.var.member))
    }
  )
  .delete('/items/:id', requireMember, zValidator('param', DeleteGroceryItem.input, rejectInvalid), async (c) => {
    await DeleteGroceryItem(c.req.valid('param'), c.var.member)
    return c.body(null, 204)
  })
  .put(
    '/stores/:id',
    requireMember,
    zValidator('param', UpsertGroceryStore.input.pick({ id: true }), rejectInvalid),
    zValidator('json', UpsertGroceryStore.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await UpsertGroceryStore({ ...c.req.valid('json'), ...c.req.valid('param') }, c.var.member))
    }
  )
  .delete('/stores/:id', requireMember, zValidator('param', DeleteGroceryStore.input, rejectInvalid), async (c) => {
    await DeleteGroceryStore(c.req.valid('param'), c.var.member)
    return c.body(null, 204)
  })
  .post('/uncheck-all', requireMember, async (c) => {
    return c.json(await UncheckAllGroceryItems({}, c.var.member))
  })
  .post('/delete-checked', requireMember, async (c) => {
    return c.json(await DeleteCheckedGroceryItems({}, c.var.member))
  })
  .post('/preview', requireMember, zValidator('json', PreviewMealGroceries.input, rejectInvalid), async (c) => {
    return c.json(await PreviewMealGroceries(c.req.valid('json'), c.var.member))
  })
  .post('/meals', requireMember, zValidator('json', AddMealsToGroceryList.input, rejectInvalid), async (c) => {
    return c.json(await AddMealsToGroceryList(c.req.valid('json'), c.var.member))
  })
  .post(
    '/alerts/:id/resolve',
    requireMember,
    zValidator('param', ResolveGroceryAlert.input.pick({ id: true }), rejectInvalid),
    zValidator('json', ResolveGroceryAlert.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await ResolveGroceryAlert({ ...c.req.valid('json'), ...c.req.valid('param') }, c.var.member))
    }
  )
