import { useEffect, useRef, useState } from "react";
import { BookOpen, CalendarPlus, Flame, Pencil, Search, UtensilsCrossed } from "lucide-react";
import { useLoaderData, useSearchParams } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

import type { Route } from "./+types/recipes";
import { loadDrawerRecipe, loadLibrary, readFilters } from "../shared/data";
import { Drawer } from "../shared/drawer";
import { MEAL_SLOTS, mediumDate, todayIso } from "../shared/format";
import { EmptyState, RecipeMeta, RecipeRow } from "../shared/parts";
import { RecipeBody } from "../shared/recipe-body";

export async function loader({ request }: Route.LoaderArgs) {
  const filters = readFilters(request);

  const [library, selected] = await Promise.all([
    loadLibrary(filters),
    loadDrawerRecipe(request),
  ]);

  return { ...library, selected };
}

export default function OptionBRecipes() {
  const { recipes, tags, filters, selected } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drawer, setDrawer] = useState<"cook" | "plan" | null>(null);

  const activeTags = filters.tags ?? [];
  const listRef = useRef<HTMLDivElement>(null);

  const patch = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { preventScrollReset: true });
  };

  /**
   * Up/down move the selection and the detail pane follows.
   *
   * This is the pane layout paying for itself: with detail always on screen,
   * stepping through the library is a keypress rather than a click-read-back
   * cycle, and it is the reason to accept three columns at all.
   *
   * Ignored while a text field has focus, so typing in the search box still
   * types. `preventDefault` stops the list from scrolling under the selection.
   *
   * No dependency array on purpose: the handler reads `recipes`, `selected`
   * and `patch`, all of which change every render, so a dep list would either
   * list all three (re-subscribing just as often) or go stale and start
   * stepping from an old selection. Re-subscribing is one add/removeListener
   * pair per render, which is cheaper than the bug.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      event.preventDefault();

      const current = recipes.findIndex((recipe) => recipe.id === selected?.id);
      const step = event.key === "ArrowDown" ? 1 : -1;
      // From nothing selected, Down opens the first row and Up the last.
      const next =
        current === -1
          ? step === 1
            ? 0
            : recipes.length - 1
          : Math.min(Math.max(current + step, 0), recipes.length - 1);

      const recipe = recipes[next];
      if (recipe) patch("recipe", recipe.id);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // Keep the keyboard selection inside the scrolled list.
  useEffect(() => {
    if (!selected) return;
    listRef.current
      ?.querySelector(`[data-recipe-id="${selected.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const toggleTag = (name: string) => {
    const next = activeTags.includes(name)
      ? activeTags.filter((tag) => tag !== name)
      : [...activeTags, name];
    patch("tags", next.length ? next.join(",") : null);
  };

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[21rem_minmax(0,1fr)]">
        {/* Pane 1 — the list. Scrolls on its own, so the detail pane never
            moves when you run down the library. */}
        <div className="flex min-h-0 flex-col border-r">
          <div className="space-y-3 border-b p-3">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search…"
                defaultValue={filters.search ?? ""}
                onChange={(event) => patch("search", event.target.value || null)}
                className="h-9 pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 8).map((tag) => (
                <button key={tag.id} type="button" onClick={() => toggleTag(tag.name)}>
                  <Badge
                    variant={activeTags.includes(tag.name) ? "default" : "outline"}
                    className="cursor-pointer text-[0.7rem] font-normal select-none"
                  >
                    {tag.name}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="text-muted-foreground flex items-baseline justify-between px-4 py-2 text-xs">
            <span>{recipes.length} recipes</span>
            <span className="flex items-center gap-1">
              <kbd className="bg-muted rounded px-1 py-0.5 font-sans text-[0.65rem]">↑</kbd>
              <kbd className="bg-muted rounded px-1 py-0.5 font-sans text-[0.65rem]">↓</kbd>
              to move
            </span>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t">
            {recipes.map((recipe) => (
              <div key={recipe.id} data-recipe-id={recipe.id}>
                <RecipeRow
                  recipe={recipe}
                  active={selected?.id === recipe.id}
                  onClick={() => patch("recipe", recipe.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Pane 2 — the detail. Always on screen, so reading costs no
            open-and-close and loses no list position. */}
        <div className="min-h-0 overflow-y-auto">
          {selected ? (
            <article className="mx-auto max-w-4xl px-8 py-7">
              <header className="mb-7 flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight">{selected.name}</h1>
                  <RecipeMeta
                    recipe={selected}
                    lastCooked={selected.lastCookedAt}
                    className="mt-2"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button className="gap-2">
                    <UtensilsCrossed className="size-4" />
                    Cook
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Log a cook" onClick={() => setDrawer("cook")}>
                    <Flame className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Add to plan" onClick={() => setDrawer("plan")}>
                    <CalendarPlus className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Edit">
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </header>

              <RecipeBody recipe={selected} columns />
            </article>
          ) : (
            <div className="flex h-full items-center justify-center p-10">
              <div className="max-w-xs text-center">
                <BookOpen className="text-muted-foreground/40 mx-auto size-10" />
                <p className="text-muted-foreground mt-4 text-sm">
                  Pick a recipe to read it here. The list stays put.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/*
        The only drawers in Option B are the two WRITES. Each is one decision
        made against the recipe still visible behind it, which is exactly the
        case a drawer is better at than a modal or a page.
      */}
      <Drawer
        open={drawer !== null}
        onOpenChange={(open) => !open && setDrawer(null)}
        width="compact"
        title={drawer === "cook" ? "Log a cook" : "Add to the plan"}
        subtitle={selected?.name}
        footer={
          <>
            <Button>{drawer === "cook" ? "Log it" : "Add to plan"}</Button>
            <Button variant="ghost" onClick={() => setDrawer(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div>
            <Label className="mb-2 block">{drawer === "cook" ? "Cooked on" : "Planned for"}</Label>
            <Input type="date" defaultValue={todayIso()} />
            <p className="text-muted-foreground mt-1.5 text-xs">{mediumDate(todayIso())}</p>
          </div>

          <div>
            <Label className="mb-2 block">Meal</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {MEAL_SLOTS.map((slot) => (
                <Button
                  key={slot}
                  type="button"
                  size="sm"
                  variant={slot === "dinner" ? "default" : "outline"}
                  className="capitalize"
                >
                  {slot}
                </Button>
              ))}
            </div>
          </div>

          {drawer === "cook" && (
            <>
              <div>
                <Label className="mb-2 block">Servings made</Label>
                <Input defaultValue={selected?.servings ?? ""} className="tabular-nums" />
              </div>
              <div>
                <Label className="mb-2 block">How did it go?</Label>
                <Textarea rows={4} placeholder="Optional — worth writing down while it's fresh." />
              </div>
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
