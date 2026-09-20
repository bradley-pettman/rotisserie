import type { Cook } from "./data";
import { mediumDate, relativeDay } from "./format";
import { CookRow, EmptyState } from "./parts";

/**
 * Cooking history, grouped by day.
 *
 * Reads `cook.label` — the name snapshotted when the cook was logged — and
 * never joins back to `recipes`. Renaming a recipe must not rewrite what you
 * remember eating, and deleting one must not erase it.
 */
export function HistoryList({ cooks }: { cooks: Cook[] }) {
  if (cooks.length === 0) {
    return <EmptyState>Nothing logged yet.</EmptyState>;
  }

  const byDay = new Map<string, Cook[]>();
  for (const cook of cooks) {
    const day = byDay.get(cook.cookedOn);
    if (day) day.push(cook);
    else byDay.set(cook.cookedOn, [cook]);
  }

  return (
    <div className="space-y-6">
      {[...byDay.entries()].map(([day, entries]) => (
        <section key={day}>
          <div className="mb-1 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">{relativeDay(day)}</h3>
            <span className="text-muted-foreground text-xs">{mediumDate(day)}</span>
          </div>
          <div className="divide-border/70 divide-y rounded-lg border px-3">
            {entries.map((cook) => (
              <CookRow key={cook.id} cook={cook} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
