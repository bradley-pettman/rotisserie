import { useLoaderData } from "react-router";

import { PageHeader } from "~/components/app-shell";
import { todayIso } from "~/lib/date";

import { HistoryList } from "../components/cook-history";
import { getCookingHistory } from "../queries/cooks";

/** How far back the log reads. Long enough to cover "have we had this lately". */
const WINDOW_DAYS = 90;

export async function loader() {
  // `today` comes from here, once per request, rather than from `new Date()`
  // during render -- which would differ between the server and the browser and
  // make "Today"/"Yesterday" flip on hydration.
  return { cooks: await getCookingHistory(WINDOW_DAYS), today: todayIso() };
}

export default function HistoryPage() {
  const { cooks, today } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-7">
      <PageHeader
        title="History"
        subtitle={
          cooks.length === 0
            ? `Nothing cooked in the last ${WINDOW_DAYS} days`
            : `${cooks.length} ${cooks.length === 1 ? "meal" : "meals"} cooked in the last ${WINDOW_DAYS} days`
        }
      />
      <HistoryList cooks={cooks} today={today} />
    </div>
  );
}
