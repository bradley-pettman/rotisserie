import { useLoaderData } from "react-router";

import { PageHeader } from "~/components/app-shell";

import { HistoryList } from "../components/cook-history";
import { getCookingHistory } from "../queries/cooks";

/** How far back the log reads. Long enough to cover "have we had this lately". */
const WINDOW_DAYS = 90;

export async function loader() {
  return { cooks: await getCookingHistory(WINDOW_DAYS) };
}

export default function HistoryPage() {
  const { cooks } = useLoaderData<typeof loader>();

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
      <HistoryList cooks={cooks} />
    </div>
  );
}
