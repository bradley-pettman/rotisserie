import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),
] satisfies RouteConfig;
