// Seed the Xero Demo Company with the three contacts every SpeakSync demo
// source references, so entity resolution ("acme ltd" -> Acme Limited)
// works against REAL Xero data.
//
// Run:  npx tsx scripts/seed-contacts.ts
//
// Idempotent — uses the executor's findContact (exact + suffix-normalised
// fuzzy match) before creating, so rerunning never duplicates. The Demo
// Company resets itself every ~28 days: rerun this the morning of judging.

import "dotenv/config";
import { nodeExecutor } from "../src/xero/executor.node";

const DEMO_CONTACTS = [
  { name: "Acme Limited", email: "ap@acme.example" },
  { name: "Globex Trading", email: "billing@globex.example" },
  { name: "Initech Ltd", email: "accounts@initech.example" },
];

(async () => {
  for (const c of DEMO_CONTACTS) {
    const existing = await nodeExecutor.findContact(c.name);
    if (existing) {
      console.log(`= exists  ${existing.name} (${existing.contactId})`);
      continue;
    }
    const created = await nodeExecutor.createContact(c.name, c.email);
    console.log(`+ created ${created.name} (${created.contactId})`);
  }
  console.log("Seed complete.");
})().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
