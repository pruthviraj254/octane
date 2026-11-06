import { Suspense } from "react";
import { Page } from "@/components/ui";
import { History } from "./history";

export default function HistoryPage() {
  return (
    <Page>
      <Suspense>
        <History />
      </Suspense>
    </Page>
  );
}
