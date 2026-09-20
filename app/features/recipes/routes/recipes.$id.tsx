import { redirect } from "react-router";

import type { Route } from "./+types/recipes.$id";

/**
 * A permalink to a recipe.
 *
 * Detail is a drawer over the list now, so this is a redirect into that drawer
 * rather than a second rendering of the same recipe. Keeping the route means
 * every link, bookmark and API-shaped URL minted before the redesign still
 * lands somewhere useful.
 *
 * No existence check on purpose: this is a redirect, not a page, and paying
 * for a query on every permalink to gate a 404 is not worth it. An id that no
 * longer resolves simply opens the list with no drawer.
 */
export function loader({ params }: Route.LoaderArgs) {
  return redirect(`/recipes?recipe=${params.id}`);
}
