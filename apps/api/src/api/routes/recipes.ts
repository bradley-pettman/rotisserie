import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { DeleteRecipe, GetRecipeById, ListRecipes, UpsertRecipe } from '~/use-cases/recipes'
import { requireMember } from '../auth'
import { rejectInvalid } from '../errors'

export const recipes = new Hono()
  .get('/', requireMember, zValidator('query', ListRecipes.input, rejectInvalid), async (c) => {
    return c.json(await ListRecipes(c.req.valid('query'), c.var.member))
  })
  .get('/:id', requireMember, zValidator('param', GetRecipeById.input, rejectInvalid), async (c) => {
    return c.json(await GetRecipeById(c.req.valid('param'), c.var.member))
  })
  .put(
    '/:id',
    requireMember,
    zValidator('param', UpsertRecipe.input.pick({ id: true }), rejectInvalid),
    zValidator('json', UpsertRecipe.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await UpsertRecipe({ ...c.req.valid('json'), ...c.req.valid('param') }, c.var.member))
    }
  )
  .delete('/:id', requireMember, zValidator('param', DeleteRecipe.input, rejectInvalid), async (c) => {
    await DeleteRecipe(c.req.valid('param'), c.var.member)
    return c.body(null, 204)
  })
