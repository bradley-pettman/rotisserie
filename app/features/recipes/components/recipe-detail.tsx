import { ExternalLink } from "lucide-react";

import { SectionHeading } from "~/components/ui/section";

import type { RecipeDetail } from "../queries/recipes";
import { IngredientList, StepList, TagList } from "./recipe-parts";

/**
 * Everything there is to read about a recipe.
 *
 * One component, two containers: the drawer over the list, and the printable
 * detail a future export view would want. Keeping the body in one place is
 * what stops the drawer and any other surface drifting into showing different
 * amounts of the same recipe.
 *
 * `columns` is the only concession to the container: a 34rem drawer stacks,
 * anything wider can put the ingredients beside the method.
 */
export function RecipeBody({
  recipe,
  columns = false,
}: {
  recipe: RecipeDetail;
  columns?: boolean;
}) {
  return (
    <div className="space-y-7">
      {recipe.tags.length > 0 && <TagList tags={recipe.tags} />}

      <div
        className={
          columns ? "grid grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-10" : "space-y-7"
        }
      >
        <section>
          <SectionHeading>Ingredients</SectionHeading>
          <IngredientList recipe={recipe} />
        </section>

        <section>
          <SectionHeading>Method</SectionHeading>
          <StepList recipe={recipe} />
        </section>
      </div>

      {recipe.notes && (
        <section>
          <SectionHeading>Notes</SectionHeading>
          <p className="bg-muted/50 rounded-lg p-3 text-sm leading-relaxed">{recipe.notes}</p>
        </section>
      )}

      {recipe.sourceUrl && (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
        >
          <ExternalLink className="size-3" />
          Original recipe
        </a>
      )}
    </div>
  );
}
