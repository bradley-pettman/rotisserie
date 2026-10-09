import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeEach } from 'vitest'
import { pool } from '~/db/connection'

const SEEDS_DIR = join(import.meta.dirname, '../../db/seeds')
const seeds = await Promise.all(['units.sql', 'ingredients.sql'].map((file) => readFile(join(SEEDS_DIR, file), 'utf8')))

beforeEach(async () => {
  await pool.query(
    `TRUNCATE recipes, recipe_ingredients, recipe_tags, tags, ingredients, units,
       planned_meals, planned_meal_dishes, cooked_meals, cooked_meal_dishes`
  )
  await pool.query(seeds.join('\n'))
})

afterAll(async () => {
  await pool.end()
})
