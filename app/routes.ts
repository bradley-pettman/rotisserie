import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
  route("recipes/:id/edit", "features/recipes/routes/recipes.$id.edit.tsx"),
  route("recipes/:id/cook", "features/recipes/routes/recipes.$id.cook.tsx"),
  route("recipes/:id", "features/recipes/routes/recipes.$id.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),

  // JSON HTTP API. These are resource routes: they export `loader` and/or
  // `action` and no default component, so they render nothing and return
  // Responses directly. Shared transport concerns (auth, envelopes, Zod
  // parsing, method dispatch) live in ~/lib/api.
  route("api/recipes", "routes/api.recipes.ts"),
  route("api/recipes/:id", "routes/api.recipes.$id.ts"),
  route("api/cooks", "routes/api.cooks.ts"),
  route("api/cooks/:id", "routes/api.cooks.$id.ts"),
  route("api/meal-plans", "routes/api.meal-plans.ts"),
  route("api/meal-plans/:id", "routes/api.meal-plans.$id.ts"),
  route("api/meal-plans/:id/items", "routes/api.meal-plans.$id.items.ts"),
  route("api/meal-plans/:id/adherence", "routes/api.meal-plans.$id.adherence.ts"),
  route("api/meal-plan-items/:itemId", "routes/api.meal-plan-items.$itemId.ts"),

  // The plan-item <-> cook link, addressed by both of its ends because the
  // pair IS its identity -- cook_fulfillments has no id of its own.
  route(
    "api/meal-plan-items/:itemId/fulfillments/:cookId",
    "routes/api.meal-plan-items.$itemId.fulfillments.$cookId.ts"
  ),
] satisfies RouteConfig;
