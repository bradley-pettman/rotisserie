import { Clock, Flame, UtensilsCrossed, Users } from "lucide-react";
import type * as React from "react";

import { Badge } from "~/components/ui/badge";
import { duration, relativeDay, titleCase, totalTime } from "~/lib/date";
import { cn } from "~/lib/utils";

import { capitalizeIngredientName } from "../lib/display-name";
import type { Cook } from "../queries/cooks";
import type { RecipeListItem, RecipeWithDetails } from "../queries/recipes";

/** One labelled figure — time, servings, last cooked. */
export function Meta({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1.5 text-sm",
        className
      )}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" />
      {children}
    </span>
  );
}

/**
 * The facts every surface repeats about a recipe.
 *
 * Each field is omitted when it is not recorded rather than rendered as a
 * zero: a `cookTimeMinutes` of 0 means "no cook time", not "0 minutes", and
 * `{recipe.cookTimeMinutes && ...}` renders a bare `0` for exactly that case.
 */
export function RecipeMeta({
  recipe,
  lastCooked,
  today,
  className,
}: {
  recipe: Pick<RecipeWithDetails, "prepTimeMinutes" | "cookTimeMinutes" | "servings">;
  /** Omit to hide the field; `null` means "never cooked", which is not the same. */
  lastCooked?: string | null;
  /** Today, from the loader. Never computed here -- see `relativeDay`. */
  today: string;
  className?: string;
}) {
  const total = duration(totalTime(recipe.prepTimeMinutes, recipe.cookTimeMinutes));

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {total && <Meta icon={Clock}>{total}</Meta>}
      {recipe.servings ? <Meta icon={Users}>Serves {recipe.servings}</Meta> : null}
      {lastCooked !== undefined && (
        <Meta icon={Flame}>
          {lastCooked ? relativeDay(lastCooked, today) : "Never cooked"}
        </Meta>
      )}
    </div>
  );
}

export function TagList({
  tags,
  max,
  className,
}: {
  tags: { id: string; name: string }[];
  max?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;

  const shown = max ? tags.slice(0, max) : tags;
  const hidden = tags.length - shown.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="font-normal">
          {tag.name}
        </Badge>
      ))}
      {hidden > 0 && <span className="text-muted-foreground text-xs">+{hidden}</span>}
    </div>
  );
}

/**
 * Instructions split into discrete, numbered steps.
 *
 * The column is one blob of text, so the split happens at render time — the
 * same rule cooking mode already applies, and the same rule the editor's
 * "one step per line" hint describes. Leading "1." / "1)" is stripped so a
 * recipe pasted with its own numbering is not numbered twice.
 */
export function steps(instructions: string): string[] {
  return instructions
    .split(/\n+/)
    .map((step) => step.trim())
    .filter(Boolean)
    .map((step) => step.replace(/^\d+[.)]\s*/, ""));
}

export function IngredientList({ recipe }: { recipe: RecipeWithDetails }) {
  return (
    <ul className="divide-border/70 divide-y text-sm">
      {recipe.ingredients.map((ingredient) => (
        <li key={ingredient.id} className="flex items-baseline justify-between gap-6 py-2">
          <span>{capitalizeIngredientName(ingredient.name)}</span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {ingredient.quantity}
            {ingredient.unit ? ` ${ingredient.unit}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StepList({ recipe }: { recipe: RecipeWithDetails }) {
  return (
    <ol className="space-y-4">
      {steps(recipe.instructions).map((step, index) => (
        <li key={index} className="flex gap-3">
          <span className="bg-secondary text-secondary-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
            {index + 1}
          </span>
          <p className="text-sm leading-relaxed">{step}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * One line of cooking history.
 *
 * Reads `cook.label` — the name snapshotted when the cook was logged — and
 * never joins back to `recipes`. Renaming a recipe must not rewrite what you
 * remember eating, and deleting one must not erase it.
 */
export function CookRow({ cook, today }: { cook: Cook; today: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <UtensilsCrossed className="text-muted-foreground size-4 shrink-0 opacity-60" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{cook.label}</p>
          <p className="text-muted-foreground text-xs">
            {titleCase(cook.mealSlot)}
            {cook.servingsMade ? ` · ${cook.servingsMade} servings` : ""}
          </p>
        </div>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
        {relativeDay(cook.cookedOn, today)}
      </span>
    </div>
  );
}

/** A recipe as a compact row, for pickers and side panels. */
export function RecipeRow({
  recipe,
  today,
  active,
  onClick,
}: {
  recipe: RecipeListItem;
  /** Today, from the loader. Never computed here -- see `relativeDay`. */
  today: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full border-b px-4 py-3 text-left transition-colors last:border-b-0",
        active ? "bg-accent/60" : "hover:bg-muted/50"
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{recipe.name}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {duration(totalTime(recipe.prepTimeMinutes, recipe.cookTimeMinutes)) ?? "—"}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <TagList tags={recipe.tags} max={2} />
        <span className="text-muted-foreground shrink-0 text-xs">
          {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt, today) : "Never"}
        </span>
      </div>
    </button>
  );
}
