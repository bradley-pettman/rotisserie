import { ExternalLink } from "lucide-react";

import type { RecipeDetail } from "./data";
import { IngredientList, SectionHeading, StepList, TagList } from "./parts";

/**
 * Everything there is to read about a recipe.
 *
 * One component, three containers: Option A puts it in a drawer, Option B in a
 * permanent pane, Option C in a drawer opened from anywhere. Keeping the body
 * identical is what makes the three options a comparison of LAYOUT rather than
 * a comparison of how much detail each one happens to show.
 *
 * `columns` is the only concession to the container: a 34rem drawer stacks,
 * a wide pane can put ingredients beside the method.
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

      <div className={columns ? "grid grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-10" : "space-y-7"}>
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
