import { z } from "zod";

/**
 * The four meal slots a cook can be logged against. Kept in one place so the
 * Zod enum and the `cooks_meal_slot_check` CHECK constraint in the
 * 20260919150000_create_cooks migration cannot drift apart.
 */
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export const createCookSchema = z
  .object({
    // THE IDEMPOTENCY KEY, and the only reason a caller may name a primary key
    // anywhere in this API. A cook is append-only FACT and has no PATCH, so a
    // client whose POST reached us but whose RESPONSE was lost -- a phone
    // leaving the kitchen, a proxy timing out -- has no safe move: retrying
    // appends a SECOND cook and nothing dedupes it. The damage is not
    // cosmetic. A duplicate over-counts `getPlanAdherence` (cooked 4 of 7,
    // reported 5) and pollutes the history window the planner reads to answer
    // "nothing we've had in two weeks". Naming the row up front lets the retry
    // collapse onto the original instead -- the same move, for the same
    // reason, as PUT on a fulfilment.
    //
    // Absent (or null) is today's behaviour exactly: Postgres fills the id
    // from the column DEFAULT and the insert cannot conflict. Nothing that
    // logs a cook today has to change.
    //
    // Generate a FRESH uuid per logged cook, when the user presses the button,
    // and keep it with the queued request so every retry of that request sends
    // the same one. An id DERIVED from the meal (recipe + day + slot) is the
    // trap: a second batch of the same dish the same evening is a real and
    // distinct cook, and deriving the id would make this endpoint swallow it.
    // `insertCook` documents what a reused id costs.
    id: z.string().uuid().nullable().default(null),
    // Nullable: takeout and improvised meals are real cooks with no recipe.
    // Absent means null, so a client logging free text need not say so twice.
    recipeId: z.string().uuid().nullable().default(null),
    // A snapshot of the recipe's name at the time of cooking, or free text.
    // Never derived at read time -- see the migration for why.
    //
    // Absent (or blank) is a REQUEST for that snapshot rather than an error:
    // `logCook` then reads the recipe's current name inside the insert's
    // transaction and stores it. That is the branch an agent holding only a
    // recipe id needs, and a `min(1)` here made it unreachable. The refinement
    // below keeps the one case `logCook` cannot serve -- no label and no
    // recipe to take one from -- a 400 rather than a 500.
    label: z.string().max(255).default(""),
    // A calendar day, not an instant: "YYYY-MM-DD". Kept as a string all the way
    // to the DATE column so no timezone can shift it to the day before.
    cookedOn: z.iso.date("Cooked date must be YYYY-MM-DD"),
    mealSlot: z.enum(MEAL_SLOTS).default("dinner"),
    // `.max()` mirrors the INTEGER column: zod's `.int()` alone allows a
    // safe integer, which is far wider than int4, so an oversized value
    // reached Postgres and came back as a 500 rather than a 400.
    servingsMade: z.number().int().positive().max(2_147_483_647).nullable().default(null),
    notes: z.string().max(5_000).nullable().default(null),
    // True when this is eating a previous cook again rather than making it
    // afresh. Counts for variety, but is not a fresh cook.
    isLeftovers: z.boolean().default(false),
  })
  .refine((cook) => cook.label.trim() !== "" || cook.recipeId !== null, {
    message: "A cook needs either a label or a recipeId to snapshot one from",
    path: ["label"],
  });

export type MealSlot = (typeof MEAL_SLOTS)[number];
export type CreateCookInput = z.infer<typeof createCookSchema>;
