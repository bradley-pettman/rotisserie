import { useEffect, useState } from "react";
import {
  CalendarPlus,
  Flame,
  Plus,
  Search,
  UtensilsCrossed,
} from "lucide-react";
import { Link, Outlet, useLoaderData, useNavigate } from "react-router";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "~/components/ui/command";
import { cn } from "~/lib/utils";

import { loadLibrary, loadWeek } from "../shared/data";
import { relativeDay } from "../shared/format";
import { Brand, navItems, OptionSwitcher, useIsActive } from "../shared/nav";

/**
 * OPTION C — Today First.
 *
 * Same sidebar, same drawers, one different bet: the app opens on TONIGHT
 * rather than on a list. The navigation is organised around time — Today,
 * Plan, then the library — because the question this app gets asked most is
 * "what are we eating", not "show me all twelve recipes".
 *
 * The command palette (⌘K) is the second half of that bet. Once the home
 * screen is a dashboard rather than a list, typing becomes the fastest way to
 * reach a specific recipe, and the nav no longer has to carry that load.
 *
 * The cost, stated plainly: bulk library work — retagging, tidying, comparing
 * — is one hop further away than in A or B.
 */
export async function loader() {
  const [week, library] = await Promise.all([loadWeek(), loadLibrary({})]);

  return {
    plannedThisWeek: week.days.reduce((total, day) => total + day.items.length, 0),
    recipes: library.recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      lastCookedAt: recipe.lastCookedAt ?? null,
    })),
  };
}

export default function OptionCLayout() {
  const { plannedThisWeek, recipes } = useLoaderData<typeof loader>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const isActive = useIsActive();
  const items = navItems("/design/c", { home: "today", plannedThisWeek });

  // ⌘K / Ctrl-K from anywhere. The palette is navigation, so it belongs on the
  // shell rather than on any one screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const openRecipe = (id: string) => {
    setPaletteOpen(false);
    navigate(`/design/c?recipe=${id}`);
  };

  return (
    <div className="bg-background text-foreground flex min-h-screen">
      <aside className="bg-sidebar sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r">
        <div className="px-4 py-4">
          <Brand />
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="border-border/70 bg-background text-muted-foreground hover:border-primary/50 flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="bg-muted rounded px-1.5 py-0.5 font-sans text-[0.7rem] font-medium">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((item) => {
            const active = isActive(item.to, { exact: item.to === "/design/c" });

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
          <OptionSwitcher current="c" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>

      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title="Search"
        description="Find a recipe or run a command"
      >
        <CommandInput placeholder="Search recipes, or type a command…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>

          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => setPaletteOpen(false)}>
              <Plus />
              New recipe
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setPaletteOpen(false)}>
              <CalendarPlus />
              Plan a meal
            </CommandItem>
            <CommandItem onSelect={() => setPaletteOpen(false)}>
              <Flame />
              Log something we cooked
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Recipes">
            {recipes.map((recipe) => (
              <CommandItem
                key={recipe.id}
                value={recipe.name}
                onSelect={() => openRecipe(recipe.id)}
              >
                <UtensilsCrossed />
                {recipe.name}
                <CommandShortcut>
                  {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt) : "Never cooked"}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
