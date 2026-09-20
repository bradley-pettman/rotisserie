import { CalendarDays, ChefHat, History, LayoutDashboard, BookOpen } from "lucide-react";
import type * as React from "react";
import { Link, useLocation } from "react-router";

import { cn } from "~/lib/utils";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shown as a count or a word on the right of the row. */
  hint?: string;
}

/**
 * The destinations. Options A and B are library-first — the recipe list is
 * home, and the planner is one of the places you go. Option C is time-first:
 * it adds a Today surface and makes IT home, which is the whole proposal, so
 * the nav differs by exactly that one entry.
 */
export function navItems(
  base: string,
  { home = "recipes", plannedThisWeek }: { home?: "recipes" | "today"; plannedThisWeek?: number } = {}
): NavItem[] {
  const recipes: NavItem = { to: base, label: "Recipes", icon: BookOpen };
  const today: NavItem = { to: base, label: "Today", icon: LayoutDashboard };
  const plan: NavItem = {
    to: `${base}/plan`,
    label: "Plan",
    icon: CalendarDays,
    hint: plannedThisWeek ? String(plannedThisWeek) : undefined,
  };
  const history: NavItem = { to: `${base}/history`, label: "History", icon: History };

  return home === "today"
    ? [today, plan, { ...recipes, to: `${base}/recipes` }, history]
    : [recipes, plan, history];
}

export function useIsActive() {
  const { pathname } = useLocation();

  return (to: string, { exact = false } = {}) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

/** The wordmark. Small enough to sit above a 64px icon rail or a full sidebar. */
export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
      <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
        <ChefHat className="size-[18px]" />
      </span>
      {!collapsed && (
        <span className="text-[0.95rem] font-semibold tracking-tight">Rotisserie</span>
      )}
    </div>
  );
}

/**
 * The prototype switcher. Not part of any proposal — it is the chrome that
 * lets a reviewer flip between the three without going back to the index.
 */
export function OptionSwitcher({
  current,
  vertical = false,
}: {
  current: "a" | "b" | "c";
  vertical?: boolean;
}) {
  const options = [
    { key: "a", to: "/design/a", label: "A" },
    { key: "b", to: "/design/b", label: "B" },
    { key: "c", to: "/design/c", label: "C" },
  ] as const;

  return (
    <div
      className={cn(
        "border-border/60 bg-background/60 flex items-center gap-1 rounded-lg border p-1",
        vertical && "flex-col"
      )}
    >
      {!vertical && (
        <span className="text-muted-foreground px-1.5 text-[0.65rem] font-medium tracking-wide uppercase">
          Option
        </span>
      )}
      {options.map((option) => (
        <Link
          key={option.key}
          to={option.to}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-xs font-semibold transition-colors",
            option.key === current
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
