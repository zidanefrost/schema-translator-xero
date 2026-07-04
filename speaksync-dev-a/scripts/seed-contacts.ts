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

// AUTHORISED invoices the Stripe-payment demo records reference — payments
// can only be applied to AUTHORISED invoices, so these must exist for the
// create_payment path to execute for real. Account 200 = Sales in the
// Demo Company chart of accounts.
// Amounts are deliberately larger than the demo payments (£1,200 / £900) so
// each rehearsal records a PARTIAL payment and the invoice stays payable.
const DEMO_INVOICES = [
  { number: "INV-1042", contact: "Acme Limited", description: "Q3 consulting — running account", amount: 5000 },
  { number: "INV-1043", contact: "Globex Trading", description: "Support retainer — running account", amount: 5000 },
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

  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  for (const inv of DEMO_INVOICES) {
    const existing = await nodeExecutor.findInvoiceByNumber(inv.number);
    if (existing) {
      console.log(`= exists  ${inv.number} (${existing.status}, due ${existing.amountDue})`);
      continue;
    }
    const contact = await nodeExecutor.findContact(inv.contact);
    const created = await nodeExecutor.createInvoice({
      contactId: contact?.contactId,
      contactName: inv.contact,
      status: "AUTHORISED",
      date: today,
      dueDate,
      invoiceNumber: inv.number,
      lineItems: [
        { description: inv.description, quantity: 1, unitAmount: inv.amount, accountCode: "200" },
      ],
    });
    console.log(`+ created ${inv.number} for ${inv.contact} (${created.status}) ${created.deepLink}`);
  }

  console.log("Seed complete.");
})().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
