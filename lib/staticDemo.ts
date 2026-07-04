import type { Recipe, SourceField, SourceProfile, SourceRecord } from "@/lib/contract";
import { parseRecords } from "@/lib/parseSource";

// Client-side stand-ins for the LLM routes, used only in the static GitHub
// Pages demo (NEXT_PUBLIC_STATIC=1). Sample sources get canned responses
// captured from real Claude runs; free-form input gets light heuristics.

const INVOICE_RECIPE: Recipe = {
  name: "Closed Deal to Xero Draft Invoice Sync",
  trigger: { source: "CRM", event: "deal_closed" },
  target: { system: "xero", action: "create_invoice" },
  intent:
    "When a deal is marked as closed in the source system, automatically create a corresponding draft invoice in Xero for the customer associated with that deal.",
  entity_resolution: { entity: "customer", match_on: "customer_name_or_email" },
  guardrails: { invoice_status: "DRAFT", confirm_below_confidence: 0.8 },
};

const PAYMENT_RECIPE: Recipe = {
  name: "Stripe Payment to Xero Invoice Sync",
  trigger: { source: "stripe", event: "payment_succeeded" },
  target: { system: "xero", action: "create_payment" },
  intent:
    "When a Stripe payment succeeds, record that payment in Xero against the invoice it settles, matching by invoice reference or by customer and amount.",
  entity_resolution: { entity: "customer", match_on: "customer_name_or_email" },
  guardrails: { confirm_below_confidence: 0.8 },
};

export function staticCompileIntent(instruction: string): Recipe {
  const s = instruction.toLowerCase();
  if (/payment|stripe|paid|settle/.test(s)) {
    return { ...PAYMENT_RECIPE, intent: `${PAYMENT_RECIPE.intent} (Static demo — compiled without the LLM.)` };
  }
  if (/\bbill\b|supplier|payable/.test(s)) {
    return {
      ...INVOICE_RECIPE,
      name: "Supplier Bill Sync",
      target: { system: "xero", action: "create_bill" },
      entity_resolution: { entity: "supplier", match_on: "supplier_name" },
      intent: `Create a bill in Xero for each matching source record. (Static demo — compiled without the LLM.)`,
    };
  }
  if (/contact\b|address book/.test(s)) {
    return {
      ...INVOICE_RECIPE,
      name: "Contact Sync",
      target: { system: "xero", action: "create_contact" },
      intent: `Create or update a Xero contact for each source record. (Static demo — compiled without the LLM.)`,
    };
  }
  return INVOICE_RECIPE;
}

// --- Canned source profiles (captured from real Schema Discovery runs) ------

const UNKNOWN_CSV_PROFILE: SourceProfile = {
  detected_format: "csv",
  fields: [
    { name: "cust_nm", type: "string", semantic: "customer or company name", sample: "acme ltd" },
    { name: "amt_gbp", type: "number", semantic: "deal amount in GBP, inconsistently formatted with currency symbols/text", sample: "£1,200.00" },
    { name: "dt_closed", type: "date", semantic: "deal close date, inconsistent formatting across rows", sample: "04/07/2026" },
    { name: "deal", type: "string", semantic: "deal or project name/description", sample: "Q3 consulting" },
    { name: "stage", type: "string", semantic: "pipeline/deal stage status", sample: "closed_won" },
  ],
};

const DEALS_PROFILE: SourceProfile = {
  detected_format: "json",
  fields: [
    { name: "customer", type: "string", semantic: "customer name", sample: "Acme Limited" },
    { name: "email", type: "string", semantic: "customer billing email", sample: "ap@acme.example" },
    { name: "amount", type: "number", semantic: "deal amount — sometimes a formatted currency string", sample: "3200" },
    { name: "close_date", type: "date", semantic: "deal close date, mixed formats", sample: "2026-06-28" },
    { name: "deal_name", type: "string", semantic: "deal name / work description", sample: "Website rebuild" },
    { name: "notes", type: "string", semantic: "free-form notes — sometimes a reference code", sample: "PO-4471" },
    { name: "stage", type: "string", semantic: "pipeline stage — likely unused", sample: "closed_won" },
  ],
};

const PAYMENTS_PROFILE: SourceProfile = {
  detected_format: "webhook",
  fields: [
    { name: "event", type: "string", semantic: "webhook event type", sample: "payment_intent.succeeded" },
    { name: "payment_id", type: "string", semantic: "payment intent identifier", sample: "pi_3RkT2wLq9x" },
    { name: "customer_name", type: "string", semantic: "customer name", sample: "Acme Limited" },
    { name: "customer_email", type: "string", semantic: "customer email", sample: "ap@acme.example" },
    { name: "amount_paid", type: "string", semantic: "payment amount, inconsistently formatted", sample: "1200.00" },
    { name: "currency", type: "string", semantic: "ISO currency code", sample: "gbp" },
    { name: "invoice_ref", type: "string", semantic: "invoice reference — sometimes missing", sample: "INV-1042" },
    { name: "paid_at", type: "date", semantic: "payment timestamp", sample: "2026-07-04T09:12:33Z" },
  ],
};

const EXTRACTED_PROFILE: SourceProfile = {
  detected_format: "json",
  fields: [
    { name: "customer", type: "string", semantic: "customer name as mentioned in the message", sample: "Acme" },
    { name: "email", type: "string", semantic: "billing email mentioned in the message", sample: "ap@acme.example" },
    { name: "amount", type: "string", semantic: "amount as written — needs normalising", sample: "£3,200" },
    { name: "deal_name", type: "string", semantic: "deal / work description", sample: "website rebuild" },
    { name: "close_date", type: "date", semantic: "close date as mentioned — may be vague", sample: "28 June 2026" },
    { name: "notes", type: "string", semantic: "references and hedges from the original message", sample: "PO-4471" },
  ],
};

function inferType(v: unknown): string {
  if (typeof v === "number") return "number";
  const s = String(v ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return "date";
  if (/^-?[\d,.]+$/.test(s.trim())) return "number";
  return "string";
}

/** Generic fallback for pasted data: structural inference without the LLM. */
function inferProfile(payload: string): SourceProfile {
  const records = parseRecords(payload);
  if (records.length === 0) {
    throw new Error("Could not parse this payload in the static demo — try one of the sample sources.");
  }
  const trimmed = payload.trim();
  const detected_format: SourceProfile["detected_format"] =
    trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "csv";
  const first = records[0];
  const fields: SourceField[] = Object.entries(first).map(([name, value]) => ({
    name,
    type: inferType(value),
    semantic: `${name.replace(/[_-]+/g, " ")} (static demo — no LLM labelling)`,
    sample: String(value ?? ""),
  }));
  return { detected_format, fields };
}

export function staticDiscoverSchema(payload: string): SourceProfile {
  if (payload.includes("cust_nm,amt_gbp")) return UNKNOWN_CSV_PROFILE;
  if (payload.includes("payment_intent.succeeded")) return PAYMENTS_PROFILE;
  if (payload.includes('"deal_name"') && payload.includes('"stage"')) return DEALS_PROFILE;
  if (payload.includes('"deal_name"') && payload.includes('"customer"')) return EXTRACTED_PROFILE;
  return inferProfile(payload);
}

// --- Canned extractions (captured from real extract-records runs) -----------

const SLACK_RECORDS: SourceRecord[] = [
  { customer: "Acme", email: "ap@acme.example", amount: "£3,200", deal_name: "website rebuild", close_date: "28 June 2026", notes: "PO-4471" },
  { customer: "Globex", email: "billing@globex.example", amount: "1,500 GBP", deal_name: "Q3 support retainer renewal", notes: "ref SO-1188" },
  { customer: "Initech", email: "accounts@initech.example", amount: "450 quid", deal_name: "onboarding", notes: "i think the close date was july 1st?" },
];

const EMAIL_RECORDS: SourceRecord[] = [
  { customer: "Acme Ltd", email: "ap@acme.example", amount: "£1,200.00", deal_name: "Q3 consulting", close_date: "4 Jul 2026", notes: "confirmed by Dave via email" },
  { customer: "GLOBEX Trading", amount: "£900.00", deal_name: "Support retainer top-up", close_date: "04/07/2026", notes: "PO REF-2291 approved" },
  { customer: "Initech", email: "accounts@initech.example", amount: "450", deal_name: "Onboarding session", close_date: "2026-07-01", notes: "customer chasing the invoice" },
];

export function staticExtractRecords(payload: string): SourceRecord[] {
  if (payload.includes("sales-wins")) return SLACK_RECORDS;
  if (payload.includes("PO approved") || payload.includes("onboarding invoice?")) return EMAIL_RECORDS;
  throw new Error(
    "Live extraction needs the API server — in this static demo, use the Slack thread or Email inbox tiles.",
  );
}
