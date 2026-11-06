import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { HowItWorks } from "@/components/how-it-works";
import { SectionTitle } from "@/components/ui";
import { COMMON_QUESTIONS } from "@/lib/site";
import { Wallet } from "./wallet";

export default function Home() {
  return (
    <>
      <Wallet />
      <section className="mx-auto mt-8 w-full max-w-6xl space-y-10 px-4 pb-16 sm:px-6 md:mt-12 md:pb-20">
        <div>
          <SectionTitle>How it works</SectionTitle>
          <HowItWorks />
        </div>
        <div>
          <SectionTitle
            aside={
              <Link href="/faq" className="group inline-flex items-center gap-1 text-sm text-ink-2 transition-colors hover:text-ink">
                All questions
                <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            }
          >
            Common questions
          </SectionTitle>
          <FaqList items={COMMON_QUESTIONS} />
        </div>
      </section>
    </>
  );
}
