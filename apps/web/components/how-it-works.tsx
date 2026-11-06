import { Card } from "./ui";

const STEPS = [
  {
    title: "Say who to pay",
    body: "Type it in plain words or paste an address. Octane works out the amount, the token and the chain.",
  },
  {
    title: "Makers compete",
    body: "Independent makers post live prices. You get the cheapest reliable one, or pick your own.",
  },
  {
    title: "Sign once",
    body: "You sign the payment and the fee. You never need to hold a gas token.",
  },
  {
    title: "It settles together",
    body: "The maker pays the gas and earns its fee in the same transaction as your payment. All of it happens, or none of it does.",
  },
];

export function HowItWorks() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, index) => (
        <li key={step.title}>
          <Card className="h-full p-5">
            <p className="figure text-[28px] leading-none text-accent">{index + 1}</p>
            <h3 className="mt-4 text-[15px] font-medium">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.body}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
