import { z } from "zod";

export const recipeIngredientSchema = z.object({
  ingredientName: z.string().min(1, "Ingredient name is required"),
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
});

/**
 * The recipe fields with NO policy attached for what an absent field means.
 * That policy is the one thing create and update genuinely disagree about, so
 * each schema below states its own and neither is derived from the other.
 *
 * Do not rebuild `updateRecipeSchema` as `createRecipeSchema.partial()`.
 * Zod's `.partial()` wraps each field in `.optional()` but leaves any
 * `.default()` sitting underneath it, and the default still fires: on zod
 * 4.3.6 a PATCH body of `{"servings": 8}` parsed through a partial()-ed
 * create schema comes back carrying `notes: null` and `tags: []`, which
 * `updateRecipe` -- it only skips fields that are `undefined` -- then writes,
 * clearing the notes and deleting every tag the recipe had. Building the two
 * schemas from these raw fields is what keeps "absent" and "null" distinct on
 * the update path.
 */
const recipeFields = {
  name: z.string().min(1, "Recipe name is required").max(255),
  instructions: z.string().min(1, "Instructions are required"),
  prepTimeMinutes: z.number().int().positive().nullable(),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  sourceUrl: z.string().url().nullable().or(z.literal("")),
  notes: z.string().nullable(),
  ingredients: z
    .array(recipeIngredientSchema)
    .min(1, "At least one ingredient is required"),
  tags: z.array(z.string().min(1)),
};

/**
 * CREATE: a field the caller never mentions is one the recipe does not have,
 * so absent means null (and, for tags, the empty list). A JSON client sends
 * the recipe it has; it does not have to pad the body with an explicit `null`
 * per optional column to avoid "expected number, received undefined". The HTML
 * forms, which do post every field, are unaffected -- an explicit null still
 * parses to null.
 *
 * The defaults also keep the output type free of `undefined`, so `createRecipe`
 * still receives `number | null` and inserts a real null rather than relying on
 * the driver to coerce one.
 */
export const createRecipeSchema = z.object({
  name: recipeFields.name,
  instructions: recipeFields.instructions,
  prepTimeMinutes: recipeFields.prepTimeMinutes.default(null),
  cookTimeMinutes: recipeFields.cookTimeMinutes.default(null),
  servings: recipeFields.servings.default(null),
  sourceUrl: recipeFields.sourceUrl.default(null),
  notes: recipeFields.notes.default(null),
  ingredients: recipeFields.ingredients,
  tags: recipeFields.tags.default([]),
});

/**
 * UPDATE: absent and null mean different things and must keep doing so.
 *
 *   field omitted  -> undefined -> `updateRecipe` leaves the column alone
 *   field: null    -> null      -> the column is cleared
 *
 * Collapsing those two would make PATCH unable to express a partial update:
 * every request would have to restate the whole recipe or silently blank the
 * parts it did not mention. Hence plain `.partial()` over the raw fields --
 * no defaults anywhere underneath it.
 *
 * The id is NOT in here. It was a hidden form field; for `PATCH
 * /api/recipes/:id` it belongs in the path, and `updateRecipe` takes it as a
 * separate argument. An `id` sent in the body is stripped, not honoured.
 */
export const updateRecipeSchema = z.object(recipeFields).partial();

export const recipeFilterSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ingredientIds: z.array(z.string().uuid()).optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeFilter = z.infer<typeof recipeFilterSchema>;
