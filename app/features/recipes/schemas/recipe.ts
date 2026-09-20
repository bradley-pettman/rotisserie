import { z } from "zod";

/**
 * BOUNDS MIRROR THE COLUMNS. Every limit below matches the DDL the value is
 * eventually written to, and exists because the schema being looser than the
 * column does not prevent the write -- it only moves where it fails.
 *
 * A 256-character ingredient name passed validation, reached
 * `ingredients.name VARCHAR(255)`, and came back as Postgres 22001, which was
 * not in the caller-fault table and so answered 500 with a stack trace in the
 * log. Same for a servings count above int4 (22003). Both are plain client
 * mistakes and should read as 400 with the offending field named, which is
 * what bounding them here produces.
 *
 * `.int()` on its own is NOT an int4: zod resolves it to a safe-integer range,
 * about four orders of magnitude wider than the column.
 */
const INT4_MAX = 2_147_483_647;

/** `recipe_ingredients.quantity` is DECIMAL(10, 2): 99999999.99 is its ceiling. */
const QUANTITY_MAX = 99_999_999.99;

/**
 * TEXT columns have no length of their own, so these are product judgements
 * rather than column limits -- generous for a real recipe, and far below the
 * point where one row makes every list response expensive to serialise.
 */
const INSTRUCTIONS_MAX = 50_000;
const NOTES_MAX = 5_000;
const SOURCE_URL_MAX = 2_048;

/**
 * Collection ceilings. Each ingredient costs up to three sequential SQL round
 * trips inside one transaction, so an unbounded array is a way for a single
 * request to hold a pooled connection for minutes -- and the pool has ten.
 */
const MAX_INGREDIENTS = 200;
const MAX_TAGS = 50;

export const recipeIngredientSchema = z.object({
  ingredientName: z
    .string()
    .min(1, "Ingredient name is required")
    .max(255, "Ingredient name is too long"),
  quantity: z.number().positive().max(QUANTITY_MAX).nullable(),
  unit: z.string().max(50, "Unit name is too long").nullable(),
  notes: z.string().max(NOTES_MAX).nullable(),
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
  // `.trim()` before `.min(1)`: without it a single space counted as
  // instructions, and cooking mode then rendered "Step 1 of 0" with an
  // Infinity% progress bar, because splitting whitespace yields no steps.
  instructions: z
    .string()
    .trim()
    .min(1, "Instructions are required")
    .max(INSTRUCTIONS_MAX),
  prepTimeMinutes: z.number().int().positive().max(INT4_MAX).nullable(),
  cookTimeMinutes: z.number().int().positive().max(INT4_MAX).nullable(),
  servings: z.number().int().positive().max(INT4_MAX).nullable(),
  // The scheme is constrained because this value is rendered into an `href`.
  // `z.string().url()` accepts `javascript:` and `data:` -- React 19 happens
  // to neutralise the former at the DOM layer, but the API serves this field
  // verbatim to clients that have no such protection, and relying on a
  // framework implementation detail is not a defence the app itself makes.
  sourceUrl: z
    .string()
    .max(SOURCE_URL_MAX)
    .url()
    .refine(
      (value) => /^https?:$/.test(new URL(value).protocol),
      "Source URL must be an http or https address"
    )
    .nullable()
    .or(z.literal("")),
  notes: z.string().max(NOTES_MAX).nullable(),
  ingredients: z
    .array(recipeIngredientSchema)
    .min(1, "At least one ingredient is required")
    .max(MAX_INGREDIENTS, "That is more ingredients than a recipe can have"),
  tags: z.array(z.string().min(1).max(100)).max(MAX_TAGS),
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
  // Bounded because it becomes a `%…%` ILIKE pattern matched against every
  // recipe name; an 8 KB pattern is free CPU for the sender and not for us.
  search: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(MAX_TAGS).optional(),
  ingredientIds: z.array(z.string().uuid()).max(MAX_INGREDIENTS).optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeFilter = z.infer<typeof recipeFilterSchema>;
