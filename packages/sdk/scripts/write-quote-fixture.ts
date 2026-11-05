import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildQuoteFixture, fixturePath } from "../test/quote-fixture.js";

const fixture = await buildQuoteFixture();
writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${fileURLToPath(fixturePath)}`);
