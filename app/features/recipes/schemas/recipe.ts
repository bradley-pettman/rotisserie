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

/**
 * A URL we are willing to hold or to act on, constrained to http(s).
 *
 * `z.string().url()` accepts `javascript:` and `data:`, and BOTH callers here
 * are places where that matters, for two different reasons:
 *
 *   - `sourceUrl` is rendered into an `href`. React 19 happens to neutralise
 *     `javascript:` at the DOM layer, but the API serves this field verbatim to
 *     clients that have no such protection, and relying on a framework
 *     implementation detail is not a defence the app itself makes.
 *   - `importRecipeSchema.url` is handed to `fetch`. `undici` will cheerfully
 *     "fetch" a `data:` URL, which is a way to feed the scraper's parser
 *     arbitrary attacker-authored bytes without any network request happening
 *     at all -- past every SSRF check, because there is no address to check.
 *
 * `scrapeRecipe` refuses non-http(s) again on its own (`assertFetchableUrl`),
 * and deliberately so: it is a library with its own callers and cannot assume
 * a validated input. This is the outer of two independent checks, not a
 * substitute for it.
 */
const httpUrl = z
  .string()
  .max(SOURCE_URL_MAX)
  .url()
  .refine(isHttpUrl, "Must be an http or https address");

/**
 * The scheme check, written so it CANNOT THROW.
 *
 * The obvious spelling -- `/^https?:$/.test(new URL(value).protocol)` inside
 * the refine -- looks safe because `.url()` runs first, and is not: zod keeps
 * running checks after a non-aborting format failure, so the refine is handed
 * the malformed string anyway. `new URL("")` and `new URL("notaurl")` then
 * throw a TypeError straight out of `safeParse`, which is not a result a
 * caller can branch on.
 *
 * What that cost, before this was a function: `POST /api/recipes` with
 * `{"sourceUrl": "notaurl"}` answered 500 with a stack trace in the log
 * instead of the 400 naming the field, because the TypeError escaped
 * `parseOrThrow` and landed in `apiRoute`'s catch-all -- a client-triggerable
 * error-log flood, the same class of problem the 22001/22003 entries in
 * `~/lib/api` were added to close. It also made `sourceUrl`'s
 * `.or(z.literal(""))` branch unreachable: the union tries the string member
 * first, and it threw before the empty-string member was ever considered, so
 * the empty input the HTML forms are documented to send only worked because
 * `parseRecipeFormData` folds "" to null before the schema sees it.
 *
 * A refine must be a predicate. "Not parseable as a URL" is simply false here;
 * `.url()` is what reports it, with a message about the right field.
 */
function isHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

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
  // http(s) only -- see `httpUrl` above for why the scheme is constrained.
  // The trailing `.or(z.literal(""))` is what lets an HTML form post an empty
  // input for "no source"; `createRecipe` folds that to a real null.
  sourceUrl: httpUrl.nullable().or(z.literal("")),
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

/**
 * The body of `POST /api/recipes/import`: one URL to scrape a DRAFT from.
 *
 * Deliberately one field and nothing else. This endpoint does not create a
 * recipe -- it returns an unsaved draft for a client to review and then POST
 * to `/api/recipes` -- so there is nothing here to merge with, override or
 * pre-fill, and no reason for it to grow a second parameter. The day it needs
 * "import and save in one call" is the day to add an explicit flag and argue
 * for it, not to quietly widen this object.
 *
 * STRICT, unlike every other schema here: a client that sends `{url, name}`
 * expecting the name to be honoured is told so, rather than silently handed a
 * draft with the scraper's name in it. An endpoint that looks like it accepts
 * overrides and drops them is a bug report waiting to happen, and the cost of
 * strictness -- normally that a caller cannot send a field early -- is nil on
 * an object that is never going to have a second field.
 * (`createRecipeSchema` stays lenient: it has HTML form callers that post
 * extra fields, and changing that is a separate decision.)
 */
export const importRecipeSchema = z.strictObject({
  url: httpUrl,
});

export type ImportRecipeInput = z.infer<typeof importRecipeSchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeFilter = z.infer<typeof recipeFilterSchema>;
