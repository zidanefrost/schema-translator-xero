# SpeakSync — Dev B build spec (for Claude Code)

## How to use this (read me first, human)

1. Create an empty repo/folder, open it in VS Code, and start Claude Code in it.
2. Save this file as **`CLAUDE.md`** in the repo root. Claude Code auto-loads `CLAUDE.md` as project context, so it'll follow this on every turn.
3. Then tell Claude Code: **"Read CLAUDE.md and start Phase 0. Stop after each phase so I can run it."**
4. Work **one phase at a time**. After each phase, run `npm run dev`, check the "Verify" line, and only then say "continue to the next phase." Don't let it build all phases in one shot — you want to catch drift early.
5. Add your `ANTHROPIC_API_KEY` to `.env.local` when Phase 0 asks for it.

Everything below is addressed to Claude Code.

---

## Role & mission

You are building the **Dev B** slice of a hackathon project called **SpeakSync** (Xero App & Agent Hackathon, Bounty 02: "The Vibe Integrator"). SpeakSync lets a user point at *any* source of business data and describe in plain English what should happen in Xero; it discovers the source's shape, maps it to Xero at runtime, and syncs — with confidence scores and human confirmation on uncertain mappings.

There are two developers. **You are only building Dev B's part.** Dev A owns everything that writes to Xero (the Mapping Engine + Xero Executor). You will **mock** Dev A's output so this slice runs end-to-end on its own.

### In scope (build this)
- The entire front end (single-page builder UI).
- **Intent Compiler** — an LLM call: plain-English sentence → `Recipe` JSON.
- **Schema Discovery** — an LLM call: any raw payload (JSON / CSV / webhook body) → `SourceProfile` JSON.
- Mock source data: `deals.json` (clean + dirty rows) and a cryptic-header `unknown.csv`.
- A **mock** `/api/map` endpoint returning a canned `MappedPayload` (stands in for Dev A).
- Rendering: recipe panel, source-profile panel, live sync feed, per-field confidence, human-confirm cards, audit log.

### Out of scope (do NOT build — Dev A owns it)
- Any real call to Xero, the Xero MCP server, OAuth, or a real Mapping Engine. Only the mock `/api/map`.
- Do not install or reference Xero SDKs.

---

## Tech stack (use exactly this)
- **Next.js (App Router) + TypeScript + Tailwind CSS.**
- **`@anthropic-ai/sdk`** for LLM calls, invoked **only** from server-side API routes (never expose the API key to the browser).
- Model: `claude-sonnet-5` (swappable via an env constant). Use JSON-only output and parse defensively.
- `ANTHROPIC_API_KEY` from `.env.local` (git-ignored).
- **No `localStorage`/`sessionStorage`** — keep all state in React state.

---

## The integration contract (create `lib/contract.ts` first, never change field names without telling the human)

These types are the boundary with Dev A. You **produce** `Recipe`, `SourceProfile`, and raw records; you **consume/render** `MappedPayload`.

```ts
// Produced by Intent Compiler (you) → consumed by Mapping Engine (Dev A)
export interface Recipe {
  name: string;
  trigger: { source: string; event: string };
  target: {
    system: "xero";
    action: "create_invoice" | "create_contact" | "create_payment" | "create_bill";
  };
  intent: string;
  entity_resolution: { entity: string; match_on: string };
  guardrails: {
    invoice_status?: "DRAFT" | "AUTHORISED";
    confirm_below_confidence: number; // e.g. 0.8
  };
}

// Produced by Schema Discovery (you) → consumed by Mapping Engine (Dev A)
export interface SourceField {
  name: string;
  type: string;      // inferred: "string" | "number" | "date" | ...
  semantic: string;  // what it represents, e.g. "customer name", "amount in GBP"
  sample: string;
}
export interface SourceProfile {
  detected_format: "json" | "csv" | "webhook" | "unknown";
  fields: SourceField[];
}

// Produced by Mapping Engine (Dev A) → rendered by you + executed by Dev A.
// You only MOCK this for now.
export interface MappedField {
  name: string;                       // Xero field name
  value: string | number | null;
  source_field: string | null;       // which source field it came from
  confidence: number;                 // 0..1
  rationale: string;                  // one sentence
}
export interface MappedPayload {
  action: string;                     // mirrors Recipe.target.action
  fields: MappedField[];
  contact: {
    match: "existing" | "new";
    contact_id?: string;
    name: string;
    confidence: number;
  };
  overall_confidence: number;
  needs_confirmation: boolean;        // true if any field < guardrail threshold
}

// A raw record from any source — arbitrary shape.
export type SourceRecord = Record<string, unknown>;
```

---

## Project structure (target)

```
app/
  page.tsx                     // the single builder screen
  api/
    compile-intent/route.ts    // Intent Compiler (LLM)
    discover-schema/route.ts   // Schema Discovery (LLM)
    map/route.ts               // MOCK of Dev A's Mapping Engine (swap later)
components/
  DescribeBox.tsx              // plain-English input → recipe
  SourcePanel.tsx              // paste/upload → source profile
  RecipePanel.tsx              // renders Recipe JSON nicely
  ProfilePanel.tsx             // renders SourceProfile nicely
  SyncFeed.tsx                 // renders MappedPayload rows + confidence
  ConfirmCard.tsx              // human-in-the-loop for low-confidence fields
  AuditLog.tsx                 // running list of decisions + rationales
lib/
  contract.ts                  // the types above
  anthropic.ts                 // SDK client + MODEL constant + JSON parse helper
  mockContacts.ts              // small fake Xero contact list for the mock mapper
public/mock/
  deals.json                   // mock CRM records (clean + dirty)
  unknown.csv                  // cryptic-header source for the "any source" demo
```

---

## Build in phases. Stop after each. Run and verify before continuing.

### Phase 0 — Scaffold
Create the Next.js + TypeScript + Tailwind app, install `@anthropic-ai/sdk`, add `.env.local` with an `ANTHROPIC_API_KEY=` placeholder and `.gitignore` it, create `lib/anthropic.ts` exporting a configured client, a `MODEL = "claude-sonnet-5"` constant, and a `safeParseJSON(text)` helper that strips ```json fences before `JSON.parse`.
**Verify:** `npm run dev` serves a blank styled page with no errors.

### Phase 1 — Contract + mock data
Create `lib/contract.ts` (types above), `public/mock/deals.json`, `public/mock/unknown.csv`, and `lib/mockContacts.ts` (see "Mock data spec" below).
**Verify:** `tsc --noEmit` passes; the two mock files load in the browser (log them).

### Phase 2 — Schema Discovery
Build `app/api/discover-schema/route.ts` (POST: `{ payload: string }` → `SourceProfile`) using the **Schema Discovery prompt** below. Build `SourcePanel` with a paste textarea + a file-upload that reads the file as text, plus a "Load unknown.csv" quick button. On submit, call the route and render the result in `ProfilePanel`.
**Verify:** pasting a `deals.json` record AND loading `unknown.csv` both produce a correctly-labelled profile (e.g. `cust_nm` → "customer name").

### Phase 3 — Intent Compiler
Build `app/api/compile-intent/route.ts` (POST: `{ instruction: string }` → `Recipe`) using the **Intent Compiler prompt** below. Build `DescribeBox` and render the result in `RecipePanel`.
**Verify:** typing *"For each closed deal, create a draft invoice in Xero for that customer"* yields a Recipe with `action: "create_invoice"`, `invoice_status: "DRAFT"`, and a sensible `entity_resolution`.

### Phase 4 — Mock mapper + sync feed
Build `app/api/map/route.ts` — the **MOCK** Mapping Engine (spec below). Add a "Run" button that, for each record in the loaded source, POSTs `{ recipe, profile, record }` to `/api/map` and renders each returned `MappedPayload` in `SyncFeed`: show each field's `name`, `value`, `source_field`, `confidence` (as a coloured bar/badge), and `rationale`, plus the contact match/new status.
**Verify:** running the clean deals produces rendered invoices with high confidence and correct contact matches.

### Phase 5 — Confidence + human-in-the-loop + audit log
When `needs_confirmation` is true (any field below `guardrails.confirm_below_confidence`), render a `ConfirmCard` letting the user accept/edit the low-confidence field(s) before the row is marked "synced." Append every accepted/auto row to `AuditLog` as a one-line NL rationale.
**Verify:** running the **dirty** deals surfaces at least one confirm card; accepting it moves the row to the audit log.

### Phase 6 — Demo polish + the two wow paths
1. **"Any source" path:** loading `unknown.csv` → discover → run must fully work (this is the headline demo).
2. **"Second integration" path:** typing a different sentence (*"When a Stripe payment succeeds, record it against the matching invoice"*) must compile to a `create_payment` recipe and run against a payment-shaped mock record — proving nothing is hardcoded.
3. Style the UI: clean, generous spacing, monospace for JSON panels, a teal→purple accent matching the event branding, confidence shown as colour (green/amber/red).
**Verify:** both demo paths run smoothly end to end; the app looks presentable on a projector.

---

## LLM prompt specs (implement these faithfully; require JSON-only output)

**Intent Compiler** (`discover` returns `Recipe`):
> System: You convert a plain-English integration request into a JSON Integration Recipe for syncing data into Xero. Identify: trigger (source + event), the Xero target action — one of create_invoice, create_contact, create_payment, create_bill — an entity_resolution rule (how to match/create the customer or supplier contact), guardrails (invoice_status DRAFT unless told otherwise; confirm_below_confidence default 0.8), and a precise one-paragraph restatement of the user's intent. Do NOT produce any field mapping. Respond with ONLY the JSON object, no prose, no markdown fences.

**Schema Discovery** (returns `SourceProfile`):
> System: You are given a raw payload from an UNKNOWN business system — it may be JSON, a CSV (with a header row), or a webhook body. Infer a Source Profile. Set detected_format. For every field, give its name, an inferred type, a short semantic label describing what it represents in plain English (e.g. "customer name", "amount in GBP", "deal close date", "pipeline stage — likely unused"), and a sample value taken from the data. Do not assume any specific source product. If it's CSV, treat the header row as field names and infer types from the values. Respond with ONLY the JSON object, no prose, no markdown fences.

Parse both responses with `safeParseJSON`; on parse failure, return a 422 with the raw text so the UI can show an error rather than crash.

---

## Mock data spec

**`lib/mockContacts.ts`** — a small fake Xero contact list the mock mapper resolves against:
```ts
export const MOCK_CONTACTS = [
  { contact_id: "c-001", name: "Acme Limited",   email: "ap@acme.example" },
  { contact_id: "c-002", name: "Globex Trading",  email: "billing@globex.example" },
  { contact_id: "c-003", name: "Initech Ltd",     email: "accounts@initech.example" },
];
```

**`public/mock/deals.json`** — mix of clean and deliberately dirty records so the demo shows graceful handling:
- 2 clean deals whose customer clearly matches an existing contact ("Acme Limited", "Globex Trading").
- Dirty rows exercising: an inconsistent name (`"acme ltd"` → must resolve to Acme Limited), a currency string (`"£1,200.00"`), an odd date (`"04/07/2026"` and one `"Jul 4 2026"`), a **missing** email, and an ambiguous `notes` field that could be description or reference.
Give each deal fields like `customer`, `email`, `amount`, `close_date`, `deal_name`, `notes`, `stage`.

**`public/mock/unknown.csv`** — the "any source" headline. Same underlying data but with **cryptic headers and messy values**, e.g.:
```
cust_nm,amt_gbp,dt_closed,deal,stage
acme ltd,"£1,200.00",04/07/2026,Q3 consulting,closed_won
GLOBEX trading,900 GBP,Jul 4 2026,Support retainer,closed_won
initech,450,2026-07-01,Onboarding,won
```

**Mock `/api/map` behaviour** (stands in for Dev A — keep the `MappedPayload` shape exact):
- Resolve the contact by fuzzy-matching the record's customer name against `MOCK_CONTACTS` (case-insensitive, ignore "ltd/limited/inc") → `match: "existing"` with the id, else `match: "new"`.
- Produce plausible `MappedField`s for the recipe's action (for create_invoice: Contact, LineItem description, LineItem amount, Date, Status=DRAFT). Parse currency strings to numbers and normalise dates to `YYYY-MM-DD` so the demo looks smart.
- Assign confidence: ~0.95 for clean direct matches; drop the **ambiguous `notes`→description** field and any **missing** field to ~0.6 so `needs_confirmation` becomes true and the confirm-card path is exercised.
- Add a one-sentence `rationale` per field. This mock is intentionally simple; Dev A's real LLM mapper replaces it later.

---

## Handoff note (how Dev A drops in later)
When Dev A's real Mapping Engine is ready, the **only** change is swapping the mock `/api/map` for their endpoint (put its URL in an env var, keep the request `{ recipe, profile, record }` and the `MappedPayload` response shape identical). Don't design anything that depends on the mapper being local.

## Working agreement (follow every turn)
- Build **one phase at a time**; stop and let the human run it.
- Keep components small and focused; prefer many small files over one big one.
- All LLM calls are **server-side** route handlers; the API key never reaches the client.
- Never write to Xero or add Xero dependencies — that's Dev A.
- No browser storage APIs. State lives in React.
- If a `contract.ts` type would need to change, say so explicitly — it's a shared boundary with Dev A.
