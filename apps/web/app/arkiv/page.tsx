import { Page } from "@/components/ui";
import { ArkivData } from "./arkiv";

export const metadata = { title: "Data on Arkiv · Octane" };

export default function ArkivPage() {
  return (
    <Page>
      <ArkivData />
    </Page>
  );
}
