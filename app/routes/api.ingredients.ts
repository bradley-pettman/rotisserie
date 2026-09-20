/**
 * Resource route: /api/ingredients  (GET)
 *
 * The ingredient vocabulary -- the 218 seeded names plus every name a recipe
 * has since introduced -- so a client can offer the editor's combobox instead
 * of letting someone free-type a near-duplicate of a name we already hold.
 * `getAllIngredients` has existed all along and was reachable only from the
 * two HTML form loaders (`recipes.new`, `recipes.$id.edit`). A UI that is not
 * the web app had no way to ask, which is the whole shape of the gap a second
 * client exposes -- see docs/plans/2026-09-20-native-ios-frontend.md.
 *
 * NAMES COME BACK IN CANONICAL STORED FORM: lowercase and trimmed. That is not
 * an accident of how the seeds were written; it is the invariant migration
 * 20260919160000 established and the CHECK constraint
 * `ingredients_name_is_canonical` now enforces. A client capitalizes for
 * DISPLAY with `capitalizeIngredientName` (features/recipes/lib/display-name)
 * and sends back the name it was given, never the string it rendered.
 *
 * That rule is worth stating here, at the endpoint that hands a client the
 * names, because the server's own fold hides half of what breaks when it is
 * ignored. `insertIngredients` lowercases and trims whatever arrives, so a
 * client that "helpfully" title-cases on the way in gets no error -- it gets a
 * silent rewrite, and from that moment its copy of the vocabulary and the
 * database's disagree. Locally every comparison then misses: the editor offers
 * to create "Chicken" beside the `chicken` it downloaded a second earlier, and
 * a user is asked to choose between two spellings of one row. That fold and
 * that CHECK are the only things between this endpoint and the bug the
 * migration had to unpick by hand -- 218 seeded rows made unreachable by a
 * capitalized twin of each, in a table grocery aggregation and inventory are
 * both going to read. Capitalization is presentation; it does not travel.
 *
 * GET only. Ingredients come into existence by being named on a recipe
 * (`insertIngredients` upserts them ON CONFLICT (name)), so a bare POST here
 * could only ever mint a name attached to nothing. api.tags.ts refuses a POST
 * on that reasoning and still ships DELETE /api/tags/:id as the broom for the
 * orphans a deleted recipe leaves behind; there is no such broom here. Adding
 * one is a genuine design question rather than a missing route -- an
 * ingredient still in use has to be refused rather than cascaded, the way
 * `deleteUnreferencedTag` refuses a tag in use, because
 * `recipe_ingredients.ingredient_id` is ON DELETE RESTRICT and a careless
 * DELETE would surface as a 500. Not shipping the mess is cheaper than
 * answering that question to clean it up.
 */
import type { Route } from "./+types/api.ingredients";
import { getAllIngredients } from "~/features/recipes/queries/recipes";
import {
  apiRoute,
  assertApiAccess,
  jsonCached,
  methodNotAllowedHandler,
} from "~/lib/api";

/**
 * GET /api/ingredients
 *
 * ETagged, and of everything under /api this is the clearest case for it. A
 * controlled vocabulary is the ideal conditional-request candidate: 218 rows
 * that change only when somebody names an ingredient nobody has named before,
 * re-fetched on every editor open by a client with no way of knowing whether
 * it needs to. Unconditionally that is the whole list over a kitchen's wifi
 * each time; with `If-None-Match` it is a 304 and no body at all, for the cost
 * of one hash of a string we had already serialized. /api/units and /api/tags
 * are the other two endpoints that fit this shape, and for the same reason.
 *
 * What makes the validator worth anything is that `getAllIngredients` carries
 * `ORDER BY name`. The ETag is a hash of the serialized body, so an unordered
 * query -- whose row order Postgres is free to vary between plans -- would
 * hand back a different hash for identical data and quietly convert every
 * conditional request into a full re-download. A total ORDER BY is a
 * precondition for caching a list, not a cosmetic detail.
 *
 * No `meta`: this is the entire vocabulary, unfiltered and unpaginated, so a
 * `total` would just be `data.length` and would say nothing that `ResponseMeta`
 * exists to say.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  return jsonCached(request, await getAllIngredients());
});

/** GET-only: keep the 405 in the same JSON envelope as everything else. */
export const action = methodNotAllowedHandler(["GET"]);
