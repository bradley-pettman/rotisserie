import { Plus } from "lucide-react";
import { Link, Outlet, useLoaderData } from "react-router";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { loadWeek } from "../shared/data";
import { Brand, navItems, OptionSwitcher, useIsActive } from "../shared/nav";

/**
 * OPTION B — Three-Pane Workbench.
 *
 * A 64px icon rail instead of a labelled sidebar, then a permanent list pane
 * and a detail pane. Nothing overlays anything: the recipe you are reading and
 * the list you are reading it from are both fully on screen, so moving between
 * twelve recipes costs twelve clicks and no open/close.
 *
 * The rail is narrow on purpose. Three columns only fit on a laptop if the
 * first one gives up its labels — that is the trade this option is making, and
 * it is the reason A exists as an alternative.
 *
 * Drawers still appear here, but only for WRITING — logging a cook, assigning
 * a meal. Reading never needs one when the detail pane is always there.
 */
export async function loader() {
  const week = await loadWeek();

  return {
    plannedThisWeek: week.days.reduce((total, day) => total + day.items.length, 0),
  };
}

export default function OptionBLayout() {
  const { plannedThisWeek } = useLoaderData<typeof loader>();
  const isActive = useIsActive();
  const items = navItems("/design/b", { plannedThisWeek });

  return (
    <div className="bg-background text-foreground flex h-screen overflow-hidden">
      <aside className="bg-sidebar flex w-16 shrink-0 flex-col items-center border-r py-3">
        <Brand collapsed />

        <Button asChild size="icon" className="mt-4" aria-label="New recipe">
          <Link to="/design/b">
            <Plus className="size-4" />
          </Link>
        </Button>

        <nav className="mt-4 flex flex-1 flex-col items-center gap-1">
          {items.map((item) => {
            const active = isActive(item.to, { exact: item.to === "/design/b" });

            return (
              <Link
                key={item.to}
                to={item.to}
                title={item.label}
                className={cn(
                  "group relative flex size-10 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                <item.icon className="size-[18px]" />
                {/* The label the rail gave up, returned on hover. */}
                <span className="bg-foreground text-background pointer-events-none absolute left-full z-20 ml-2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                  {item.label}
                </span>
                {item.hint && (
                  <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[0.6rem] font-semibold tabular-nums">
                    {item.hint}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <OptionSwitcher current="b" vertical />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
