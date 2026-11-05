import { Suspense } from "react";
import { History } from "./history";

export default function HistoryPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Suspense>
        <History />
      </Suspense>
    </main>
  );
}
