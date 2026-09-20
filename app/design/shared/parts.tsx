import { Clock, Flame, UtensilsCrossed, Users } from "lucide-react";
import type * as React from "react";

import { Badge } from "~/components/ui/badge";
import { capitalizeIngredientName } from "~/features/recipes/lib/display-name";
import { cn } from "~/lib/utils";

import type { Cook, RecipeListItem, RecipeWithDetails, ResolvedMealPlanItem } from "./data";
import { duration, relativeDay, titleCase, totalTime } from "./format";

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
    <span className={cn("text-muted-foreground inline-flex items-center gap-1.5 text-sm", className)}>
      <Icon className="size-3.5 shrink-0 opacity-70" />
      {children}
    </span>
  );
}

/**
 * The facts every surface repeats about a recipe. Each field is omitted when
 * it is not recorded rather than rendered as a zero — `cookTimeMinutes` of 0
 * is "no cook time", not "0 minutes", and the current list prints a bare "0"
 * for exactly this reason.
 */
export function RecipeMeta({
  recipe,
  lastCooked,
  className,
}: {
  recipe: { prepTimeMinutes: number | null; cookTimeMinutes: number | null; servings: number | null };
  lastCooked?: string | null;
  className?: string;
}) {
  const total = duration(totalTime(recipe.prepTimeMinutes, recipe.cookTimeMinutes));

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {total && <Meta icon={Clock}>{total}</Meta>}
      {recipe.servings ? <Meta icon={Users}>Serves {recipe.servings}</Meta> : null}
      {lastCooked !== undefined && (
        <Meta icon={Flame}>{lastCooked ? relativeDay(lastCooked) : "Never cooked"}</Meta>
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
      {hidden > 0 && (
        <span className="text-muted-foreground text-xs">+{hidden}</span>
      )}
    </div>
  );
}

/**
 * Instructions split into discrete, numbered steps.
 *
 * The column is stored as one blob of text, so the split happens at render
 * time — the same rule cooking mode already applies. Steps are what people
 * actually read, and a wall of text is the single biggest reason the current
 * detail page is hard to cook from.
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

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
      {children}
    </h3>
  );
}

/** A single planned meal as it appears inside a day column. */
export function PlanItem({
  item,
  onClick,
  className,
}: {
  item: ResolvedMealPlanItem;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "border-border/70 bg-card w-full rounded-lg border p-2.5 text-left transition-colors",
        onClick && "hover:border-primary/60 hover:bg-accent/40 cursor-pointer",
        // A free-text meal is not a recipe and should not pretend to be one.
        !item.recipeId && "border-dashed",
        className
      )}
    >
      <span className="text-muted-foreground block text-[0.65rem] font-semibold tracking-wide uppercase">
        {item.mealSlot}
      </span>
      <span className="mt-0.5 block text-sm leading-snug font-medium">{item.displayName}</span>
      {item.notes && (
        <span className="text-muted-foreground mt-1 block text-xs leading-snug">{item.notes}</span>
      )}
    </Tag>
  );
}

/** One line of cooking history. Reads `label`, never a join — history is a fact. */
export function CookRow({ cook }: { cook: Cook }) {
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
        {relativeDay(cook.cookedOn)}
      </span>
    </div>
  );
}

/** A recipe as a compact row — the library's default density in Options A and B. */
export function RecipeRow({
  recipe,
  active,
  onClick,
}: {
  recipe: RecipeListItem;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full border-b px-4 py-3 text-left transition-colors last:border-b-0",
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
          {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt) : "Never"}
        </span>
      </div>
    </button>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground border-border/70 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
      {children}
    </p>
  );
}
