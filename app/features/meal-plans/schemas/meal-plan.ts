import { z } from "zod";

// Mirrors the meal_plan_items_meal_slot_check constraint, and deliberately
// matches cooks.meal_slot so a cook can be lined up against the plan item it
// fulfils without translating between two vocabularies.
export const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const createMealPlanSchema = z
  .object({
    // Unnamed plans are normal -- "the week of the 21st" needs no title.
    name: z.string().max(255).nullable().optional(),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((plan) => plan.endsOn >= plan.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

export const mealPlanItemSchema = z
  .object({
    // Null by design: a plan item does not need a recipe, which is what lets a
    // plan be built entirely from free text ("pizza night") and lets the
    // planner run with no recipe book at all. Held as a raw id -- this module
    // never resolves it to a name.
    recipeId: z.string().uuid().nullable().default(null),
    customText: z.string().trim().max(255).nullable().default(null),
    plannedOn: z.iso.date(),
    mealSlot: mealSlotSchema.default("dinner"),
    sortOrder: z.number().int().min(0).default(0),
    notes: z.string().nullable().default(null),
  })
  .refine((item) => item.recipeId !== null || (item.customText?.length ?? 0) > 0, {
    // The database CHECK can only test for NULL, so it would accept a
    // custom_text of "". Reject that here: an item must actually name
    // something, and an empty string names nothing.
    message: "A meal must have either a recipe or a description",
    path: ["customText"],
  });

/**
 * Moving an item rewrites WHEN the meal is meant to happen, and nothing else:
 * not the recipe, not the notes, and -- deliberately -- not any cook already
 * recorded against it, which keeps its own date.
 *
 * Both fields are required, with no default slot. `moveMealPlanItem` writes
 * planned_on and meal_slot together in one UPDATE, so a body naming only the
 * new day would have to invent a slot: defaulting it to "dinner" would quietly
 * move a breakfast to dinner. A move states where the meal lands, in full.
 */
export const moveMealPlanItemSchema = z.object({
  plannedOn: z.iso.date(),
  mealSlot: mealSlotSchema,
});

export type MealSlot = z.infer<typeof mealSlotSchema>;
export type CreateMealPlanInput = z.infer<typeof createMealPlanSchema>;
export type MealPlanItemInput = z.infer<typeof mealPlanItemSchema>;
export type MoveMealPlanItemInput = z.infer<typeof moveMealPlanItemSchema>;
