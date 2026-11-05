# Reach

## Who it's for

**Payers:** AI agents and people who hold stablecoins but no gas token. An agent working across several chains has to keep a gas balance topped up on each one. With Octane it holds only stablecoins and pays per action.

**Makers:** anyone with idle gas tokens who wants to earn a spread. Joining means posting a quote; there's nobody to ask.

**Merchants:** businesses taking stablecoin payments, who can cover the fee for their customers.

## Can they try it today?

Yes, from the source:

```bash
pnpm install
cp .env.example .env     # add your own test keys
pnpm makers              # three AI makers
pnpm web                 # open http://localhost:3000
```

An agent connects through the MCP server in `.mcp.json`. Everything runs on public testnets with test tokens. Any wallet can also read the live market directly with the query in the README.

The app isn't hosted yet, so a visitor can't try it from a link. That needs public maker endpoints.

## Will we keep building?

*The builder should finish this section in their own words.*
