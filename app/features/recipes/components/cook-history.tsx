import { EmptyState } from "~/components/ui/section";
import { mediumDate, relativeDay } from "~/lib/date";

import type { Cook } from "../queries/cooks";
import { CookRow } from "./recipe-parts";

/**
 * Cooking history, grouped by day.
 *
 * Renders `cook.label` rather than joining back to `recipes`: a cook is a
 * FACT, and renaming or deleting the recipe must not rewrite the record of
 * having made it.
 */
export function HistoryList({ cooks, today }: { cooks: Cook[]; today: string }) {
  if (cooks.length === 0) {
    return <EmptyState>Nothing logged yet.</EmptyState>;
  }

  // Cooks arrive newest-first and already ordered, so grouping is a single
  // pass: a Map keeps insertion order, which keeps the days in that order too.
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
            <h3 className="text-sm font-semibold">{relativeDay(day, today)}</h3>
            <span className="text-muted-foreground text-xs">{mediumDate(day)}</span>
          </div>
          <div className="divide-border/70 divide-y rounded-lg border px-3">
            {entries.map((cook) => (
              <CookRow key={cook.id} cook={cook} today={today} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
