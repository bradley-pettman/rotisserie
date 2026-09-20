import { useLoaderData } from "react-router";

import { loadHistory } from "../shared/data";
import { HistoryList } from "../shared/history";

export async function loader() {
  return { cooks: await loadHistory(45) };
}

export default function OptionBHistory() {
  const { cooks } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-7">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <p className="text-muted-foreground mt-0.5 mb-6 text-sm">
          {cooks.length} meals cooked in the last 45 days
        </p>
        <HistoryList cooks={cooks} />
      </div>
    </div>
  );
}
