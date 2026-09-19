/**
 * Presentation-layer capitalization for names stored in canonical lowercase.
 *
 * `ingredients.name` (and `units.name`) are stored folded to lowercase so that
 * "Allspice", "allspice" and "ALLSPICE" are one row rather than three -- see
 * `insertIngredients` in ../queries/recipes and migration 20260919160000.
 * Storage being canonical is exactly why capitalization has to happen here,
 * on the way to the screen, instead of on the way to the database.
 *
 * Only the FIRST character is touched. The rest is left exactly as given,
 * which matters for two reasons: a stored name is already lowercase so there
 * is nothing to fold, and this helper is also handed text the user is still
 * typing (a brand-new ingredient in the combobox), where lowercasing the tail
 * would rewrite what they typed under their cursor.
 */
export function capitalizeIngredientName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
