import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
  route("recipes/:id/edit", "features/recipes/routes/recipes.$id.edit.tsx"),
  route("recipes/:id", "features/recipes/routes/recipes.$id.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),
] satisfies RouteConfig;
