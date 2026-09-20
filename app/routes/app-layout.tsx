import { Outlet, useLoaderData } from "react-router";

import { AppShell } from "~/components/app-shell";
import { countMealsPlannedBetween } from "~/features/meal-plans/queries/meal-plans";
import { addDays, startOfWeek, todayIso } from "~/lib/date";

/**
 * The shell every page inside the app renders into.
 *
 * A layout route rather than a component each page remembers to wrap itself
 * in: nesting means the sidebar is structural, so a new route cannot
 * accidentally ship without navigation — which is exactly how the app ended up
 * with five pages and no way between them.
 *
 * Cooking mode is deliberately NOT nested here. It is a full-screen mode with
 * one way out, and the chrome would be in the way.
 */
export async function loader() {
  const week = startOfWeek(todayIso());

  return {
    plannedThisWeek: await countMealsPlannedBetween(week, addDays(week, 6)),
  };
}

export default function AppLayout() {
  const { plannedThisWeek } = useLoaderData<typeof loader>();

  return (
    <AppShell plannedThisWeek={plannedThisWeek}>
      <Outlet />
    </AppShell>
  );
}
