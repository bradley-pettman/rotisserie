/**
 * Resource route: /api/recipes  (GET list, POST create)
 *
 * No default export -- this route renders nothing, it only speaks JSON.
 * Every line here is transport: parse, delegate to the recipes query module,
 * serialize. There is no SQL and no validation logic in this file.
 */
import type { Route } from "./+types/api.recipes";
import {
  countRecipes,
  createRecipe,
  getRecipeById,
  listRecipes,
} from "~/features/recipes/queries/recipes";
import {
  createRecipeSchema,
  recipeFilterSchema,
} from "~/features/recipes/schemas/recipe";
import type { ResponseMeta } from "~/lib/api";
import {
  apiRoute,
  assertApiAccess,
  csvSearchParam,
  enumSearchParam,
  jsonCached,
  jsonOk,
  methodNotAllowed,
  optionalIntSearchParam,
  parseOrThrow,
  readJsonBody,
  requireFound,
} from "~/lib/api";

/**
 * Response fields a caller can ask for that are not on every row by default.
 *
 * `lastCookedAt` is opt-in rather than always-on because it is one more query
 * per request, and the HTML recipe list -- which goes through the same
 * `listRecipes` -- renders no such column. A planner that wants recency asks
 * for it once per page; everybody else keeps the two-query read.
 */
const INCLUDABLE_FIELDS: readonly string[] = ["lastCookedAt"];

/**
 * Pagination bounds. `limit` has no default: omitting it returns every
 * matching recipe, which is what this endpoint has always done and what the
 * HTML list depends on. 200 is a ceiling on one page, not on the collection.
 */
const MAX_LIMIT = 200;
const MAX_OFFSET = 1_000_000;

/**
 * GET /api/recipes?search=chick&tags=weeknight,vegetarian&limit=20&offset=40
 *                 &include=lastCookedAt
 *
 * `tags` is ALL-OF, not any-of: a recipe is returned only if it carries every
 * listed tag. That semantic lives in `listRecipes`, not here.
 *
 * Every row carries its own `tags` back, which is what makes the filter usable
 * -- a caller that can select on tags but not read them has to fetch each
 * recipe again to learn what it just filtered on. `listRecipes` gets them in
 * one batched query for the whole page, so this stays two queries at any
 * result count.
 *
 * `limit`/`offset` are read here rather than through `recipeFilterSchema`
 * because they are not part of "which recipes match" -- they are transport,
 * the same as `?days=` on /api/cooks, and they use the same bounded-integer
 * helper.
 *
 * The response carries `meta.total` alongside the array: the size of the
 * MATCHING SET, not of the page. See `jsonCached`/`ResponseMeta` for why it
 * sits beside `data` rather than inside it -- the existing agent client
 * unwraps `body["data"]` and hands it straight to a tool, so a new sibling key
 * is invisible to it while a reshaped `data` would not be.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const url = new URL(request.url);

  const filter = parseOrThrow(
    recipeFilterSchema,
    {
      search: url.searchParams.get("search") ?? undefined,
      tags: csvSearchParam(url, "tags"),
    },
    "Invalid query parameters"
  );

  const include = enumSearchParam(url, "include", INCLUDABLE_FIELDS);
  const limit = optionalIntSearchParam(url, "limit", { min: 1, max: MAX_LIMIT });
  const offset = optionalIntSearchParam(url, "offset", { min: 0, max: MAX_OFFSET });

  // Concurrent, because the two are independent: the count does not need the
  // page and the page does not need the count. Serially this endpoint would
  // pay a full round trip for a number nobody waits on.
  //
  // The cost is honest and worth naming: `total` is UNCONDITIONAL, so every
  // list read is now one query more than it was. That is deliberate rather
  // than another `?include=` knob -- a count a caller has to know to ask for
  // is a count most callers will not have, and the alternative (inferring it
  // from `data.length`) is wrong precisely when it matters. The count runs the
  // same predicate the list just ran, over the same indexes, and materialises
  // no rows -- cheap next to serialising the page itself.
  //
  // The two statements are not one snapshot, so under concurrent writes
  // `total` can disagree with the page by a row. At family scale that is
  // invisible; it is the same instability `?offset` already has, and fixing
  // either one properly means a cursor rather than a transaction.
  const [recipes, total] = await Promise.all([
    listRecipes(filter, {
      limit,
      offset,
      includeLastCookedAt: include.includes("lastCookedAt"),
    }),
    countRecipes(filter),
  ]);

  // `limit`/`offset` are echoed ONLY when the caller supplied them. Inventing
  // values for them would be a lie in the one case that matters: this endpoint
  // returns every matching recipe when `limit` is absent, and `limit: 200` in
  // the meta of an unbounded response tells a client to stop reading at 200.
  const meta: ResponseMeta = { total };
  if (limit !== undefined) meta.limit = limit;
  if (offset !== undefined) meta.offset = offset;

  return jsonCached(request, recipes, meta);
});

/** POST /api/recipes -- body validated by createRecipeSchema. */
export const action = apiRoute(async ({ request }: Route.ActionArgs) => {
  assertApiAccess(request);

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["GET", "POST"]);
  }

  const input = parseOrThrow(createRecipeSchema, await readJsonBody(request));
  const created = await createRecipe(input);

  // createRecipe returns the bare `recipes` row. Re-read through
  // getRecipeById so the 201 body carries the ingredients and tags that were
  // just written -- including their canonicalized units.
  const recipe = requireFound(await getRecipeById(created.id), "Recipe not found");

  return jsonOk(recipe, 201, { Location: `/api/recipes/${recipe.id}` });
});
