import { Plus } from "lucide-react";
import type * as React from "react";
import { Link, Outlet, useLoaderData } from "react-router";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { loadWeek } from "../shared/data";
import { Brand, navItems, OptionSwitcher, useIsActive } from "../shared/nav";

/**
 * OPTION A — Rail and Drawer.
 *
 * A labelled 240px sidebar, one centred content column, and a right-hand
 * drawer for anything secondary. The literal reading of the brief: the list
 * never goes away, and reading a recipe never costs you your scroll position.
 *
 * The one deliberate exception is the recipe editor, which is a real page.
 * Nine fields, a repeating ingredient row and a tag editor do not fit a
 * drawer without becoming a cramped page with a shadow on it.
 */
export async function loader() {
  const week = await loadWeek();

  return {
    plannedThisWeek: week.days.reduce((total, day) => total + day.items.length, 0),
  };
}

export default function OptionALayout() {
  const { plannedThisWeek } = useLoaderData<typeof loader>();
  const isActive = useIsActive();
  const items = navItems("/design/a", { plannedThisWeek });

  return (
    <div className="bg-background text-foreground flex min-h-screen">
      <aside className="bg-sidebar sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r">
        <div className="px-4 py-4">
          <Brand />
        </div>

        <div className="px-3 pb-3">
          <Button asChild className="w-full justify-start gap-2">
            <Link to="/design/a/recipes/new">
              <Plus className="size-4" />
              New recipe
            </Link>
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((item) => {
            const active = isActive(item.to, { exact: item.to === "/design/a" });

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.hint && (
                  <span className="text-muted-foreground text-xs tabular-nums">{item.hint}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3">
          <OptionSwitcher current="a" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
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
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 pb-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
