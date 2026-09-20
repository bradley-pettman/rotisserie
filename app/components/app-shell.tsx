import { BookOpen, CalendarDays, ChefHat, History, Plus } from "lucide-react";
import type * as React from "react";
import { Link, useLocation } from "react-router";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * The application shell: a persistent left sidebar beside the content.
 *
 * Before this existed every page was an independent centred column with no
 * navigation at all, so the only route into the recipe list was the splash
 * screen and the only route out of a recipe was a "back" link. Anything that
 * is not the recipe book — the planner, the cook log — had nowhere to be
 * reached from.
 *
 * Deliberately NOT rendered around cooking mode, which is a full-screen mode
 * with one way out, and the one place chrome would be actively unhelpful.
 *
 * Below `lg` the sidebar collapses to a 64px icon rail rather than disappearing
 * behind a menu button. The pages it replaced were fluid centred columns, so a
 * fixed 240px rail would have been a regression on a phone; an icon rail keeps
 * every destination one tap away and still leaves ~310px of content at 375px.
 * A proper mobile treatment is its own piece of work (ROADMAP #51).
 */
const NAV = [
  { to: "/recipes", label: "Recipes", icon: BookOpen },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/history", label: "History", icon: History },
] as const;

export function AppShell({
  plannedThisWeek,
  children,
}: {
  /** Shown against Plan. Omitted when the week has nothing in it. */
  plannedThisWeek?: number;
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();

  return (
    <div className="bg-background text-foreground flex min-h-screen">
      <aside className="bg-sidebar sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r lg:w-60">
        <Link
          to="/recipes"
          className="flex items-center justify-center gap-2.5 px-4 py-4 lg:justify-start"
        >
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <ChefHat className="size-[18px]" />
          </span>
          <span className="hidden text-[0.95rem] font-semibold tracking-tight lg:inline">
            Rotisserie
          </span>
        </Link>

        <div className="px-3 pb-3">
          <Button asChild className="w-full justify-center gap-2 lg:justify-start">
            <Link to="/recipes/new" aria-label="New recipe" title="New recipe">
              <Plus className="size-4" />
              <span className="hidden lg:inline">New recipe</span>
            </Link>
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3" data-testid="app-nav">
          {NAV.map((item) => {
            // `startsWith` so /recipes/new and /recipes/:id/edit keep Recipes
            // lit; the trailing slash stops /planner matching /plan.
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const hint = item.to === "/plan" ? plannedThisWeek : undefined;

            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={cn(
                  "flex items-center justify-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="hidden flex-1 lg:inline">{item.label}</span>
                {hint ? (
                  <span className="text-muted-foreground hidden text-xs tabular-nums lg:inline">
                    {hint}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Title, optional supporting line, and the page's primary action. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 pb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="text-muted-foreground mt-1 text-sm">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
