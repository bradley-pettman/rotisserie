import { useLoaderData } from "react-router";

import { PageHeader } from "./layout";
import { loadHistory } from "../shared/data";
import { HistoryList } from "../shared/history";

export async function loader() {
  return { cooks: await loadHistory(45) };
}

export default function OptionAHistory() {
  const { cooks } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <PageHeader
        title="History"
        subtitle={`${cooks.length} meals cooked in the last 45 days`}
      />
      <HistoryList cooks={cooks} />
    </div>
  );
}
