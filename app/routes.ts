import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
  route("recipes/:id/edit", "features/recipes/routes/recipes.$id.edit.tsx"),
  route("recipes/:id/cook", "features/recipes/routes/recipes.$id.cook.tsx"),
  route("recipes/:id", "features/recipes/routes/recipes.$id.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),

  // ---- UI redesign prototypes ----
  //
  // Three proposed shells, mounted beside the current UI rather than replacing
  // it, so the two can be clicked through side by side. They read the real
  // loaders and the real database; nothing under /design writes. See
  // app/design/README.md for what each option is arguing for.
  route("design", "design/index.tsx"),

  route("design/a", "design/option-a/layout.tsx", [
    index("design/option-a/recipes.tsx"),
    route("plan", "design/option-a/plan.tsx"),
    route("history", "design/option-a/history.tsx"),
    route("recipes/new", "design/option-a/new.tsx"),
    route("recipes/:id/edit", "design/option-a/editor.tsx"),
  ]),

  route("design/b", "design/option-b/layout.tsx", [
    index("design/option-b/recipes.tsx"),
    route("plan", "design/option-b/plan.tsx"),
    route("history", "design/option-b/history.tsx"),
  ]),

  route("design/c", "design/option-c/layout.tsx", [
    index("design/option-c/today.tsx"),
    route("plan", "design/option-c/plan.tsx"),
    route("recipes", "design/option-c/recipes.tsx"),
    route("history", "design/option-c/history.tsx"),
  ]),

  // JSON HTTP API. These are resource routes: they export `loader` and/or
  // `action` and no default component, so they render nothing and return
  // Responses directly. Shared transport concerns (auth, envelopes, Zod
  // parsing, method dispatch) live in ~/lib/api.
  // Liveness. First in the list because it is the one endpoint that must keep
  // answering when everything below it cannot.
  route("api/health", "routes/api.health.ts"),

  route("api/recipes", "routes/api.recipes.ts"),
  route("api/recipes/:id", "routes/api.recipes.$id.ts"),

  // The tag vocabulary. Read-only as a collection -- tags come into existence
  // by tagging a recipe -- plus a single-id DELETE for the orphans a deleted
  // recipe leaves behind.
  route("api/tags", "routes/api.tags.ts"),
  route("api/tags/:id", "routes/api.tags.$id.ts"),
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
