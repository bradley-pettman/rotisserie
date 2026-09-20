import { redirect } from "react-router";

/**
 * `/` is the recipe list.
 *
 * This used to be a splash screen whose only job was to offer the two links
 * that are now permanently in the sidebar. With a shell there is nothing left
 * for it to say, and a screen you click through without reading is a screen
 * that should not exist.
 */
export function loader() {
  return redirect("/recipes");
}
