import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Everything inside the shell: the sidebar is structural, so a page cannot
  // ship without navigation. Cooking mode sits outside it on purpose.
  layout("routes/app-layout.tsx", [
    index("routes/home.tsx"),

    route("recipes", "features/recipes/routes/recipes.tsx"),
    route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
    route("recipes/:id/edit", "features/recipes/routes/recipes.$id.edit.tsx"),
    // Kept as a permalink. Recipe detail is a drawer over the list now, so
    // this redirects into it rather than rendering a second copy of the page.
    route("recipes/:id", "features/recipes/routes/recipes.$id.tsx"),

    route("history", "features/recipes/routes/history.tsx"),

    // The planner resolves plan items' recipe names, which crosses two feature
    // modules, so it lives out here with the API routes rather than inside
    // either module. See the module boundary rule in CLAUDE.md.
    route("plan", "routes/plan.tsx"),
  ]),

  // A full-screen mode with one way out. Outside the shell deliberately.
  route("recipes/:id/cook", "features/recipes/routes/recipes.$id.cook.tsx"),

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
