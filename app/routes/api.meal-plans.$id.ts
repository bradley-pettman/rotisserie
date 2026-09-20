/**
 * Resource route: /api/meal-plans/:id  (GET, DELETE)
 */
import type { Route } from "./+types/api.meal-plans.$id";
import { getMealPlanWithRecipeNames } from "~/features/integrations/plan-with-recipes";
import {
  deleteMealPlan,
  getMealPlanById,
} from "~/features/meal-plans/queries/meal-plans";
import {
  apiRoute,
  assertApiAccess,
  enumSearchParam,
  jsonCached,
  jsonError,
  methodNotAllowed,
  noContent,
  requireFound,
  uuidPathParam,
} from "~/lib/api";

/**
 * Response fields a caller can ask for that are not on a plan by default.
 *
 * WHY THIS ENDPOINT NEEDS ONE AT ALL. A `MealPlanItem` carries a bare
 * `recipeId` and never a name, because `app/features/meal-plans/**` may not
 * import `recipes` -- the planner has to keep working with the recipe book
 * absent. In process, that cost is paid once by `integrations/
 * plan-with-recipes.ts`, the ONLY module permitted to import two feature
 * modules, which is exactly why the resolution belongs there and not in the
 * meal-plans module: putting the join behind `getMealPlanById` would buy this
 * endpoint a name and cost the boundary the rule exists to hold.
 *
 * Over HTTP that rule previously stopped at the network edge. CLAUDE.md tells
 * callers to use the batched resolver and to "never call getRecipeById per
 * item", but a client rendering a week got UUIDs and exactly two options: one
 * request per item, or a second implementation of the batching in Swift. The
 * second is the worse of the two -- it is the "client that reimplements a
 * server rule is the client that drifts from it" failure, and it drifts on
 * the parts that are not obvious, like which of `customText` and the recipe
 * name wins when an item carries both. `?include=recipeNames` hands back the
 * server's own answer instead of asking every client to re-derive it.
 *
 * OPT-IN rather than always-on, for the reason `?include=lastCookedAt` is on
 * /api/recipes: it is one more query per request, and the agent service --
 * which matches plan items to cooks by id -- never renders a name. Opt-in is
 * also what keeps this change additive rather than breaking: a caller that
 * does not ask gets byte-for-byte the body it got before.
 */
const INCLUDABLE_FIELDS: readonly string[] = ["recipeNames"];

/**
 * GET /api/meal-plans/:id?include=recipeNames
 *
 * The resolved form is a SUPERSET, not a different shape: every item keeps
 * `recipeId` and gains `displayName` and `recipeExists`. One typed model
 * decodes both responses with those two fields optional, which is the same
 * bargain `?covering=` on the collection route makes by staying an array.
 *
 * `recipeExists` is worth having even for a client that does its own
 * labelling: it is the only thing that separates "this item is free text"
 * from "the recipe was deleted out from under this plan", and a renderer
 * that cannot tell them apart shows a blank cell for both.
 */
export const loader = apiRoute(async ({ request, params }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Meal plan");
  const include = enumSearchParam(new URL(request.url), "include", INCLUDABLE_FIELDS);

  // Both reads answer null for a plan that does not exist, so the 404 is
  // decided once below instead of in each branch. `getMealPlanWithRecipeNames`
  // costs the plan read plus ONE name query whatever the plan holds -- see the
  // contract at the top of plan-with-recipes.ts -- so the opt-in is a second
  // query, not a second query per item.
  const plan = include.includes("recipeNames")
    ? await getMealPlanWithRecipeNames(id)
    : await getMealPlanById(id);

  // The validator is a hash of the body actually served, which is what makes
  // it safe across `include` variants: the two bodies differ, so they cannot
  // share an ETag. Deriving it from `updatedAt` instead -- the obvious
  // "cheaper" version, and the one to resist -- would hand both variants the
  // same validator, and a client that had read the plain form would then get
  // a 304 for a body carrying names it has never seen. It would be wrong in
  // the other direction too: names resolve LIVE, so renaming a recipe changes
  // this response without touching the plan's `updatedAt`.
  return jsonCached(request, requireFound(plan, "Meal plan not found"));
});

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Meal plan");

  if (request.method !== "DELETE") {
    return methodNotAllowed(request, ["GET", "DELETE"]);
  }

  if (!(await deleteMealPlan(id))) throw jsonError(404, "Meal plan not found");

  return noContent();
});
