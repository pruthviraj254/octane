# Reach

## Who it's for

**Payers:** AI agents and people who hold stablecoins but no gas token. An agent working across several chains has to keep a gas balance topped up on each one. With Octane it holds only stablecoins and pays per action.

**Makers:** anyone with idle gas tokens who wants to earn a spread. Joining means posting a quote; there's nobody to ask.

**Merchants:** businesses taking stablecoin payments, who can cover the fee for their customers.

## Can they try it today?

Yes. The live app is at <https://octane.rishabhprajapati.me>, with makers relaying from a public server. It can also run from the source, and watching the live market takes no keys at all:

```bash
pnpm install
cp .env.example .env
pnpm web                 # open http://localhost:3000
```

To run makers and pay on your own machine, add your own test keys to `.env` and run `pnpm makers`.

An agent connects through the MCP server in `.mcp.json`. Everything runs on public testnets with test tokens. Any wallet can also read the live market directly with the query in the README.

A new wallet still needs its first test USDT sent to it, because it can't swap without WBT.

## Will we keep building?

*The builder should finish this section in their own words.*
