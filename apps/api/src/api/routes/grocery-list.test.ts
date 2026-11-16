import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMember } from '~/test/accounts'
import { send } from '~/test/api'
import { cookedMealInput, plannedMealInput, recipeInput } from '~/test/factories'

async function putItem(
  overrides: {
    id?: string
    text?: string
    checked?: boolean
    sortOrder?: number
    storeId?: string | null
    section?: string
  } = {}
) {
  const { id = randomUUID(), ...body } = { text: 'Milk', checked: false, sortOrder: 1, ...overrides }
  return send('PUT', `/grocery-list/items/${id}`, body)
}

async function putRecipe(overrides: Parameters<typeof recipeInput>[0] = {}) {
  const { id, ...body } = recipeInput(overrides)
  await send('PUT', `/recipes/${id}`, body)
  return { id, ...body }
}

async function planRecipe(recipeId: string, overrides: Parameters<typeof plannedMealInput>[0] = {}) {
  const { id, ...body } = plannedMealInput({
    dishes: [{ id: randomUUID(), recipeId, customText: null, notes: null }],
    ...overrides
  })
  return (await send('PUT', `/planned-meals/${id}`, body)).body
}

async function texts() {
  const list = await send('GET', '/grocery-list')
  return list.body.items.map((item: { text: string }) => item.text)
}

describe('grocery items', () => {
  it('creates, edits, checks and lists items in their order', async () => {
    const eggs = randomUUID()
    await putItem({ text: 'Bread', sortOrder: 2 })
    await putItem({ id: eggs, text: 'Eggs', sortOrder: 1 })

    const checked = await putItem({ id: eggs, text: 'A dozen eggs', checked: true, sortOrder: 1 })

    expect(checked).toMatchObject({ status: 200, body: { id: eggs, text: 'A dozen eggs', checked: true } })
    expect(checked.body).not.toHaveProperty('line')
    expect(await send('GET', '/grocery-list')).toMatchObject({
      status: 200,
      body: {
        items: [
          { text: 'A dozen eggs', checked: true },
          { text: 'Bread', checked: false }
        ],
        alerts: [],
        meals: []
      }
    })
  })

  it('returns 400 for blank text', async () => {
    expect((await putItem({ text: '   ' })).status).toBe(400)
  })

  it('deletes an item, then returns 404 on a repeat', async () => {
    const created = await putItem()

    expect((await send('DELETE', `/grocery-list/items/${created.body.id}`)).status).toBe(204)
    expect((await send('DELETE', `/grocery-list/items/${created.body.id}`)).status).toBe(404)
  })

  it('unchecks everything, or deletes what is checked', async () => {
    await putItem({ text: 'Milk', checked: true, sortOrder: 1 })
    await putItem({ text: 'Bread', checked: false, sortOrder: 2 })

    const unchecked = await send('POST', '/grocery-list/uncheck-all')
    expect(unchecked.body.items.map((item: { checked: boolean }) => item.checked)).toEqual([false, false])

    await putItem({ text: 'Butter', checked: true, sortOrder: 3 })
    const remaining = await send('POST', '/grocery-list/delete-checked')
    expect(remaining.body.items.map((item: { text: string }) => item.text)).toEqual(['Milk', 'Bread'])
  })
})

describe('POST /grocery-list/preview', () => {
  it('lists what the meals need, scaled to the headcount and merged across them', async () => {
    const recipe = await putRecipe()
    const first = await planRecipe(recipe.id, { headcount: 8 })
    const second = await planRecipe(recipe.id, { plannedOn: '2026-10-10' })
    await putItem({ text: 'Onion' })

    const preview = await send('POST', '/grocery-list/preview', { plannedMealIds: [first.id, second.id] })

    expect(preview).toMatchObject({
      status: 200,
      body: {
        lines: [
          {
            name: 'ground turkey',
            amounts: [{ quantity: 3, unit: { name: 'pound' } }],
            dishes: ['Turkey Sloppy Joes'],
            onList: null
          },
          { name: 'onion', amounts: [{ quantity: 3, unit: null }], onList: 'Onion' }
        ]
      }
    })
  })

  it('returns 404 for a planned meal that does not exist', async () => {
    expect((await send('POST', '/grocery-list/preview', { plannedMealIds: [randomUUID()] })).status).toBe(404)
  })
})

describe('POST /grocery-list/meals', () => {
  it('adds the lines not left out, and records the meal', async () => {
    const recipe = await putRecipe()
    const meal = await planRecipe(recipe.id)

    const list = await send('POST', '/grocery-list/meals', {
      plannedMealIds: [meal.id],
      excludeKeys: [`text:never-matches`]
    })

    expect(list).toMatchObject({
      status: 200,
      body: { items: [{ text: '1 lb ground turkey' }, { text: '1 onion' }], meals: [{ plannedMealId: meal.id }], alerts: [] }
    })
  })

  it('adds a second meal into the unchecked items already there, after the rest of the list', async () => {
    const recipe = await putRecipe()
    const first = await planRecipe(recipe.id)
    const second = await planRecipe(recipe.id, { plannedOn: '2026-10-10', headcount: 2 })
    await send('POST', '/grocery-list/meals', { plannedMealIds: [first.id] })
    await putItem({ text: 'Coffee', sortOrder: 100 })

    const preview = await send('POST', '/grocery-list/preview', { plannedMealIds: [second.id] })
    const onion = preview.body.lines.find((line: { name: string }) => line.name === 'onion')
    await send('POST', '/grocery-list/meals', { plannedMealIds: [second.id], excludeKeys: [onion.key] })

    expect(await texts()).toEqual(['1½ lb ground turkey', '1 onion', 'Coffee'])
  })

  it('adds only what changed when a meal already on the list is added again', async () => {
    const recipe = await putRecipe()
    const meal = await planRecipe(recipe.id)
    await send('POST', '/grocery-list/meals', { plannedMealIds: [meal.id] })

    expect((await send('POST', '/grocery-list/preview', { plannedMealIds: [meal.id] })).body.lines).toEqual([])

    await putRecipe({ ...recipe, servings: 2 })
    await send('POST', '/grocery-list/meals', { plannedMealIds: [meal.id] })

    expect(await texts()).toEqual(['2 lb ground turkey', '2 onions'])
    expect((await send('GET', '/grocery-list')).body.alerts).toEqual([])
  })

  it('adds a new line beside an item whose text was edited by hand', async () => {
    const recipe = await putRecipe()
    const first = await planRecipe(recipe.id)
    const second = await planRecipe(recipe.id, { plannedOn: '2026-10-10' })
    const list = await send('POST', '/grocery-list/meals', { plannedMealIds: [first.id] })
    const turkey = list.body.items[0]
    await putItem({ id: turkey.id, text: 'Turkey, the big pack', sortOrder: turkey.sortOrder })

    await send('POST', '/grocery-list/meals', { plannedMealIds: [second.id] })

    expect(await texts()).toEqual(['Turkey, the big pack', '2 onions', '1 lb ground turkey'])
  })
})

describe('grocery alerts', () => {
  async function listedMeal() {
    const recipe = await putRecipe()
    const meal = await planRecipe(recipe.id)
    await send('POST', '/grocery-list/meals', { plannedMealIds: [meal.id] })
    return { recipe, meal }
  }

  it('says when a recipe on the list changed, and adds what is new', async () => {
    const { recipe } = await listedMeal()
    await putRecipe({
      ...recipe,
      ingredients: [
        { name: 'ground turkey', quantity: 2, unit: 'lb', notes: null },
        { name: 'sloppy joe sauce', quantity: 1, unit: 'can', notes: null }
      ]
    })

    const list = await send('GET', '/grocery-list')
    expect(list.body.alerts).toMatchObject([
      {
        kind: 'changed',
        label: 'Turkey Sloppy Joes',
        added: [{ name: 'sloppy joe sauce' }],
        removed: [{ name: 'onion' }],
        changed: [{ before: { amounts: [{ quantity: 1 }] }, after: { amounts: [{ quantity: 2 }] } }]
      }
    ])

    const resolved = await send('POST', `/grocery-list/alerts/${list.body.alerts[0].id}/resolve`, { addNew: true })

    expect(resolved.body.alerts).toEqual([])
    expect(resolved.body.items.map((item: { text: string }) => item.text)).toEqual([
      '2 lb ground turkey',
      '1 onion',
      '1 can sloppy joe sauce'
    ])
  })

  it('says when the headcount changed, and dismissing leaves the items alone', async () => {
    const { meal } = await listedMeal()
    const { id, ...body } = { ...meal, headcount: 8 }
    await send('PUT', `/planned-meals/${id}`, {
      ...body,
      dishes: meal.dishes.map((dish: { id: string; recipe: { id: string } }) => ({
        id: dish.id,
        recipeId: dish.recipe.id,
        customText: null,
        notes: null
      }))
    })

    const list = await send('GET', '/grocery-list')
    expect(list.body.alerts).toMatchObject([{ kind: 'changed', changed: [{}, {}] }])

    const resolved = await send('POST', `/grocery-list/alerts/${list.body.alerts[0].id}/resolve`, { addNew: false })

    expect(resolved.body).toMatchObject({ alerts: [], items: [{ text: '1 lb ground turkey' }, { text: '1 onion' }] })
  })

  it('stays quiet when a recipe changes in a way the list does not care about', async () => {
    const { recipe } = await listedMeal()
    await putRecipe({ ...recipe, instructions: 'Different words', tags: ['quick'] })

    expect((await send('GET', '/grocery-list')).body.alerts).toEqual([])
  })

  it('says when a meal on the list was taken off the plan, until dismissed', async () => {
    const { meal } = await listedMeal()
    await send('DELETE', `/planned-meals/${meal.id}`)

    const list = await send('GET', '/grocery-list')
    expect(list.body).toMatchObject({
      alerts: [{ kind: 'removed', plannedMealId: null, label: 'Turkey Sloppy Joes', removed: [{}, {}] }],
      meals: []
    })

    const resolved = await send('POST', `/grocery-list/alerts/${list.body.alerts[0].id}/resolve`, { addNew: true })
    expect(resolved.body).toMatchObject({ alerts: [], items: [{}, {}] })
    expect((await send('POST', `/grocery-list/alerts/${list.body.alerts[0].id}/resolve`, { addNew: true })).status).toBe(404)
  })

  it('stays quiet about a meal that has been cooked', async () => {
    const { recipe, meal } = await listedMeal()
    const { id, ...cooked } = cookedMealInput({ plannedMealId: meal.id })
    await send('PUT', `/cooked-meals/${id}`, cooked)
    await putRecipe({ ...recipe, ingredients: [] })

    expect((await send('GET', '/grocery-list')).body.alerts).toEqual([])
  })
})

async function putStore(name: string, sortOrder = 1) {
  const id = randomUUID()
  return (await send('PUT', `/grocery-list/stores/${id}`, { name, sortOrder })).body
}

describe('grocery stores', () => {
  it('creates, renames, orders and deletes stores', async () => {
    const aldi = await putStore('Aldi', 2)
    await putStore('Costco', 1)
    await send('PUT', `/grocery-list/stores/${aldi.id}`, { name: 'ALDI', sortOrder: 2 })

    expect((await send('GET', '/grocery-list')).body.stores).toMatchObject([{ name: 'Costco' }, { name: 'ALDI' }])

    const item = await putItem({ text: 'Berries', storeId: aldi.id })
    expect((await send('DELETE', `/grocery-list/stores/${aldi.id}`)).status).toBe(204)
    expect((await send('GET', '/grocery-list')).body.items).toMatchObject([{ id: item.body.id, storeId: null }])
  })

  it('returns 409 for a second store with the same name', async () => {
    await putStore('Aldi')
    const response = await send('PUT', `/grocery-list/stores/${randomUUID()}`, { name: 'aldi', sortOrder: 2 })
    expect(response.status).toBe(409)
  })
})

describe('store and section', () => {
  it('gives a typed item the section of the ingredient it names', async () => {
    const created = await putItem({ text: '2 lb ground beef' })
    expect(created.body).toMatchObject({ storeId: null, section: 'meat_seafood' })
  })

  it('remembers a store and section chosen for an item, for the next item with that name', async () => {
    const costco = await putStore('Costco')
    const beef = await putItem({ text: 'Ground beef' })
    await putItem({ id: beef.body.id, text: 'Ground beef', storeId: costco.id })
    const diapers = await putItem({ text: 'Diapers' })
    await putItem({ id: diapers.body.id, text: 'Diapers', section: 'baby_kids' })

    expect((await putItem({ text: '1 lb ground beef' })).body).toMatchObject({ storeId: costco.id, section: 'meat_seafood' })
    expect((await putItem({ text: 'diapers' })).body).toMatchObject({ storeId: null, section: 'baby_kids' })
  })

  it("keeps an item's store and section when only its text or check changes", async () => {
    const costco = await putStore('Costco')
    const item = await putItem({ text: 'Milk', storeId: costco.id, section: 'dairy_eggs' })

    const edited = await putItem({ id: item.body.id, text: 'Oat milk', checked: true })

    expect(edited.body).toMatchObject({ storeId: costco.id, section: 'dairy_eggs', checked: true })
  })

  it('lets an item go back to any store without forgetting its section', async () => {
    const costco = await putStore('Costco')
    const item = await putItem({ text: 'Eggs', storeId: costco.id })
    await putItem({ id: item.body.id, text: 'Eggs', storeId: null })

    expect((await putItem({ text: 'Eggs' })).body).toMatchObject({ storeId: null, section: 'dairy_eggs' })
  })

  it('gives imported items their remembered store, their section and their meal', async () => {
    const costco = await putStore('Costco')
    const typed = await putItem({ text: 'ground turkey' })
    await putItem({ id: typed.body.id, text: 'ground turkey', storeId: costco.id })
    await send('DELETE', `/grocery-list/items/${typed.body.id}`)
    const recipe = await putRecipe()
    const meal = await planRecipe(recipe.id)

    const list = await send('POST', '/grocery-list/meals', { plannedMealIds: [meal.id] })

    expect(list.body.items).toMatchObject([
      { text: '1 lb ground turkey', storeId: costco.id, dishes: ['Turkey Sloppy Joes'], mealIds: [meal.id] },
      { text: '1 onion', storeId: null, section: 'produce', mealIds: [meal.id] }
    ])
    expect(list.body.meals).toMatchObject([{ plannedMealId: meal.id, label: 'Turkey Sloppy Joes' }])
  })
})

describe('another household', () => {
  it('cannot see, change or delete our items, read our meals or resolve our alerts', async () => {
    const neighbor = await createMember({ displayName: 'Neighbor' })
    const item = await putItem({ text: 'Ours' })
    const recipe = await putRecipe()
    const meal = await planRecipe(recipe.id)
    await send('POST', '/grocery-list/meals', { plannedMealIds: [meal.id] })
    await send('DELETE', `/planned-meals/${meal.id}`)
    const [alert] = (await send('GET', '/grocery-list')).body.alerts
    const as = { as: neighbor }

    expect((await send('GET', '/grocery-list', undefined, as)).body).toEqual({
      items: [],
      alerts: [],
      stores: [],
      meals: []
    })
    expect((await send('PUT', `/grocery-list/items/${item.body.id}`, { text: 'Theirs', sortOrder: 1 }, as)).status).toBe(404)
    expect((await send('DELETE', `/grocery-list/items/${item.body.id}`, undefined, as)).status).toBe(404)
    expect((await send('POST', '/grocery-list/delete-checked', undefined, as)).status).toBe(200)
    expect((await send('POST', '/grocery-list/preview', { plannedMealIds: [meal.id] }, as)).status).toBe(404)
    const store = await putStore('Ours')
    expect((await send('DELETE', `/grocery-list/stores/${store.id}`, undefined, as)).status).toBe(404)
    expect((await send('PUT', `/grocery-list/stores/${store.id}`, { name: 'Theirs', sortOrder: 1 }, as)).status).toBe(404)
    const theirItem = { text: 'Theirs', sortOrder: 1, storeId: store.id }
    expect((await send('PUT', `/grocery-list/items/${randomUUID()}`, theirItem, as)).status).toBe(409)
    expect((await send('POST', `/grocery-list/alerts/${alert.id}/resolve`, { addNew: true }, as)).status).toBe(404)

    expect(await texts()).toContain('Ours')
  })
})
