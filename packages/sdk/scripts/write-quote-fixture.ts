import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPaymentFixture, buildQuoteFixture, fixturePath, paymentFixturePath } from "../test/quote-fixture.ts";

const fixture = await buildQuoteFixture();
writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${fileURLToPath(fixturePath)}`);

writeFileSync(paymentFixturePath, `${JSON.stringify(buildPaymentFixture(), null, 2)}\n`);
console.log(`wrote ${fileURLToPath(paymentFixturePath)}`);
