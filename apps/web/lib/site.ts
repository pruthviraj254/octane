export const REPO_URL = "https://github.com/pruthviraj254/octane";
export const DISCLOSURE_URL = `${REPO_URL}#ai-usage-disclosure`;

/** Shown in the footer and on the About page. Add more links here and both pick them up. */
export const BUILDER = {
  name: "Pruthvi Parmar",
  links: [{ label: "GitHub", href: "https://github.com/pruthviraj254" }],
};

export interface Faq {
  question: string;
  answer: string;
}

export const FAQ_SECTIONS: { title: string; items: Faq[] }[] = [
  {
    title: "The basics",
    items: [
      {
        question: "What is Octane?",
        answer:
          "An open gas market. Independent makers compete to pay the gas on your payment, and you pay the winner one fee in stablecoins, inside the same transaction.",
      },
      {
        question: "Do I need a gas token?",
        answer:
          "No. You only need stablecoins: USDT on Whitechain, or USDC on the EF devnet. The gas still has to be paid, so a maker pays it and your fee covers it.",
      },
      {
        question: "What does a payment cost?",
        answer:
          "One fee, shown before you sign. On Whitechain it stays between 0.065 and 0.50 USDT. On the EF devnet it's 0.05 USDC unless a maker sets its own rate. You also sign the most you're willing to pay, and the fee can't go above that.",
      },
      {
        question: "Is this real money?",
        answer: "No. Octane runs on public testnets, so every token here is a test token with no real value.",
      },
      {
        question: "How do I get test tokens?",
        answer:
          "A new wallet starts empty, and it can't swap for tokens without a gas token. Someone has to send it its first test USDT or USDC.",
      },
    ],
  },
  {
    title: "Safety",
    items: [
      {
        question: "Can a maker take more than I agreed to?",
        answer:
          "No. Your signature fixes the amount, the recipient, the maker and the fee. If any of them changes, the contract rejects the payment before money moves.",
      },
      {
        question: "What happens if a maker fails?",
        answer:
          "Your money doesn't move, because the payment and the fee settle together. On Whitechain, if you let Octane choose, it moves on to the next maker. On the EF devnet, or if you picked a maker yourself, the payment stops.",
      },
      {
        question: "What if a maker goes offline?",
        answer:
          "Its price leaves the board within 30 seconds, with no cleanup needed. A price on the board is never stale, and every signed quote has its own expiry too.",
      },
      {
        question: "Is the built-in wallet safe?",
        answer:
          "It's fine for test tokens and wrong for real money. Its key stays in your browser, each website gets its own wallet, and clearing your browser data removes it.",
      },
      {
        question: "Have the contracts been audited?",
        answer: "No. Octane was built during a hackathon. Please don't use it with real funds.",
      },
    ],
  },
  {
    title: "Makers",
    items: [
      {
        question: "What's a maker?",
        answer: "Someone with spare gas tokens who pays gas for other people and earns a stablecoin fee on each payment.",
      },
      {
        question: "Can anyone be a maker?",
        answer:
          "Yes. There's no signup and no allowlist. Anyone running Octane with spare WBT or ETH can post quotes to the market.",
      },
      {
        question: "How are prices set?",
        answer:
          "A maker can set its own rate, which never moves until the maker changes it. Or it can use an AI agent, which reprices about every 10 seconds with a formula: gas cost × (1 + AI buffer) + margin + low-tank charge. The AI only picks the buffer, from 0 to 50%. Code does the rest.",
      },
      {
        question: "What is a fade score?",
        answer:
          "A reputation score built from how much of the time a maker stayed on the board, whether its wallet could cover what it quoted, and whether it delivered the auctions it won. Lower is better. The inputs are public, and one command reproduces the score.",
      },
    ],
  },
  {
    title: "AI agents",
    items: [
      {
        question: "Can AI agents pay with Octane?",
        answer:
          "Yes. An MCP server lets an agent such as Claude check prices, pay people, pay several at once and read its history, holding stablecoins and no gas token. A daily spend limit keeps it in bounds.",
      },
      {
        question: "What is a gas auction?",
        answer:
          "An agent with payments to make posts the job on Arkiv, and makers bid for about 15 seconds. The cheapest reliable bid wins. It takes longer than a normal payment, and the agent needs a little tGLM to write the job to Arkiv.",
      },
    ],
  },
  {
    title: "The project",
    items: [
      {
        question: "Where does the data live?",
        answer:
          "Live quotes, bids, fills and reputation live on Arkiv, and each maker's long trading journal lives on Swarm. Octane has no database of its own. The Arkiv page shows all of it, with the exact query behind each table.",
      },
      {
        question: "Why two chains?",
        answer:
          "They show the same market working with two different tools. Whitechain uses signed USDT authorisations with EIP-3009. The EF devnet uses frame transactions from EIP-8141, where a maker's paymaster pays the gas.",
      },
      {
        question: "Can I use MetaMask?",
        answer:
          "For USDT, yes. Browser wallets can't sign EIP-8141 frame transactions yet, so USDC on the EF devnet needs the built-in wallet.",
      },
      {
        question: "Who built this?",
        answer:
          "Pruthvi Parmar, at ETHGlobal Mumbai in November 2026, with heavy help from Claude Code. The code is open source under the MIT license, and the README says which parts AI wrote.",
      },
    ],
  },
];

/** The questions a first-time visitor asks, for the home page. */
export const COMMON_QUESTIONS = [FAQ_SECTIONS[0], FAQ_SECTIONS[1]]
  .flatMap((section) => section?.items ?? [])
  .filter((item) => ["Do I need a gas token?", "What does a payment cost?", "Can a maker take more than I agreed to?"].includes(item.question));
