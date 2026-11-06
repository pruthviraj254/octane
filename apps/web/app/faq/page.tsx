import type { Metadata } from "next";
import { FaqList } from "@/components/faq-list";
import { Page, PageHeader, SectionTitle } from "@/components/ui";
import { FAQ_SECTIONS } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ · Octane",
  description: "How Octane works, what it costs and how your money stays safe.",
};

export default function FaqPage() {
  return (
    <Page>
      <PageHeader
        title={
          <>
            Questions, <em>answered.</em>
          </>
        }
        description="How Octane works, what a payment costs, and what happens when something goes wrong."
      />
      <div className="mt-10 space-y-8">
        {FAQ_SECTIONS.map((section) => (
          <section key={section.title}>
            <SectionTitle>{section.title}</SectionTitle>
            <FaqList items={section.items} />
          </section>
        ))}
      </div>
    </Page>
  );
}
