/**
 * The recipe form's wire shape, in one place.
 *
 * Create and edit post identical bodies and validate against the same schema,
 * so the parsing lived twice and drifted apart field by field. Empty strings
 * become null rather than "" because the columns are nullable and an empty
 * source URL is "no source", not a URL of zero length.
 *
 * Returns an unvalidated object on purpose: the caller runs
 * `createRecipeSchema` on it, so there is exactly one place that decides what
 * a valid recipe is.
 */
export interface RecipeFormInput {
  name: string;
  instructions: string;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  notes: string | null;
  ingredients: unknown;
  tags: unknown;
}

/** A numeric field, or null when it was left blank. */
function optionalNumber(value: FormDataEntryValue | null): number | null {
  return value ? Number(value) : null;
}

/**
 * The repeating ingredient rows and the tag chips are React state, not
 * individually named inputs, so they ride along as JSON in one hidden field
 * each. Malformed JSON is treated as "nothing sent" and left for the schema to
 * reject, rather than throwing a 500 out of the action.
 */
function optionalJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value === "") return [];

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function parseRecipeFormData(formData: FormData): RecipeFormInput {
  return {
    name: String(formData.get("name") ?? ""),
    instructions: String(formData.get("instructions") ?? ""),
    prepTimeMinutes: optionalNumber(formData.get("prepTimeMinutes")),
    cookTimeMinutes: optionalNumber(formData.get("cookTimeMinutes")),
    servings: optionalNumber(formData.get("servings")),
    sourceUrl: (formData.get("sourceUrl") as string) || null,
    notes: (formData.get("notes") as string) || null,
    ingredients: optionalJson(formData.get("ingredients")),
    tags: optionalJson(formData.get("tags")),
  };
}
