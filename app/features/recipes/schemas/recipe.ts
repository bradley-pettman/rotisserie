import { z } from "zod";

export const recipeIngredientSchema = z.object({
  ingredientName: z.string().min(1, "Ingredient name is required"),
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
});

export const createRecipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required").max(255),
  instructions: z.string().min(1, "Instructions are required"),
  prepTimeMinutes: z.number().int().positive().nullable(),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  sourceUrl: z.string().url().nullable().or(z.literal("")),
  notes: z.string().nullable(),
  ingredients: z.array(recipeIngredientSchema).min(1, "At least one ingredient is required"),
  tags: z.array(z.string().min(1)).default([]),
});

export const updateRecipeSchema = createRecipeSchema.partial().extend({
  id: z.string().uuid(),
});

export const recipeFilterSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ingredientIds: z.array(z.string().uuid()).optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeFilter = z.infer<typeof recipeFilterSchema>;
