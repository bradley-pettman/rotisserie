import { z } from "zod";

/**
 * The four meal slots a cook can be logged against. Kept in one place so the
 * Zod enum and the `cooks_meal_slot_check` CHECK constraint in the
 * 20260919150000_create_cooks migration cannot drift apart.
 */
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export const createCookSchema = z.object({
  // Nullable: takeout and improvised meals are real cooks with no recipe.
  recipeId: z.string().uuid().nullable(),
  // A snapshot of the recipe's name at the time of cooking, or free text.
  // Never derived at read time -- see the migration for why.
  label: z.string().min(1, "Label is required").max(255),
  // A calendar day, not an instant: "YYYY-MM-DD". Kept as a string all the way
  // to the DATE column so no timezone can shift it to the day before.
  cookedOn: z.iso.date("Cooked date must be YYYY-MM-DD"),
  mealSlot: z.enum(MEAL_SLOTS).default("dinner"),
  servingsMade: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  // True when this is eating a previous cook again rather than making it
  // afresh. Counts for variety, but is not a fresh cook.
  isLeftovers: z.boolean().default(false),
});

export type MealSlot = (typeof MEAL_SLOTS)[number];
export type CreateCookInput = z.infer<typeof createCookSchema>;
