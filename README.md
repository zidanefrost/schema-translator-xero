# SpeakSync

**Point at any source of business data, describe what should happen in Xero in plain English, and watch it sync — with confidence scores and a human in the loop when it matters.**

Built for the Xero App & Agent Hackathon, Bounty 02: *"The Vibe Integrator"*.

SpeakSync has no hardcoded connectors. It discovers the shape of whatever data you give it (JSON, CSV, webhook bodies — even with cryptic headers like `cust_nm` and `amt_gbp`) at runtime, compiles your English instruction into an integration recipe, and maps records into Xero actions with a per-field confidence score and rationale. Anything below the confidence guardrail stops and asks a human first. Every decision lands in an audit log.

![Any source → Xero](https://img.shields.io/badge/any%20source-%E2%86%92%20xero-2dd4bf?style=flat-square) ![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000?style=flat-square&logo=nextdotjs) ![Claude](https://img.shields.io/badge/LLM-Claude-8b5cf6?style=flat-square)

---

## How it works

```
 "For each closed deal, create          ┌──────────────────┐
  a draft invoice in Xero"       ──────▶│  Intent Compiler  │──▶  Recipe (JSON)
                                        │      (LLM)        │
                                        └──────────────────┘
 cust_nm,amt_gbp,dt_closed,...          ┌──────────────────┐
 acme ltd,"£1,200.00",04/07/26   ──────▶│ Schema Discovery  │──▶  SourceProfile (JSON)
                                        │      (LLM)        │
                                        └──────────────────┘
                                        ┌──────────────────┐
 { recipe, profile, record }     ──────▶│  Mapping Engine   │──▶  MappedPayload
                                        │  (mocked here)    │     + confidence per field
                                        └──────────────────┘     + needs_confirmation
```

1. **Describe it** — one sentence in plain English compiles to a typed `Recipe`: trigger, Xero target action (`create_invoice` / `create_contact` / `create_payment` / `create_bill`), entity-resolution rule, and guardrails (draft-by-default, confirm-below-confidence threshold).
2. **Point at your data** — paste, upload, or pick a sample source. The Schema Discovery LLM infers every field's type and *meaning* ("customer name", "amount in GBP", "deal close date") without assuming any source product.
3. **Sync** — each record is mapped to Xero fields with a confidence score and one-line rationale. Clean rows auto-sync; ambiguous ones (messy names, `£1,200.00` strings, `04/07/2026` dates, missing emails, free-text notes) surface a confirm card for you to accept or edit before they count as synced.

## Demo paths

- **The "any source" path** — load the *Mystery CSV* (cryptic headers, messy values, unknown origin) → discover → run. It maps to draft invoices, fuzzy-matches `acme ltd` → *Acme Limited*, parses currency strings, and normalises dates.
- **The "second integration" path** — type *"When a Stripe payment succeeds, record it against the matching invoice"* and run it against the Stripe-shaped payment events. A completely different recipe and source shape works with zero code changes — nothing is hardcoded.
- **The "it's not even data" path** — load the *Slack thread* or *Email inbox*. An extraction stage (`/api/extract-records`) reads plain human chatter ("closed Acme!! £3,200 for the website rebuild…"), pulls out structured deal records, ignores the off-topic messages, and keeps hedges like "i think the close date was july 1st?" as low-confidence notes — which then surface as confirm cards downstream.

## Getting started

```bash
npm install
# create .env.local with:
# ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You need an [Anthropic API key](https://console.anthropic.com/); it is only ever used server-side.

| Env var | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | LLM calls (server-side route handlers only) | — required |
| `SPEAKSYNC_MODEL` | Override the Claude model | `claude-sonnet-5` |

## Project structure

```
app/
  page.tsx                     # the single builder screen (3-step guided flow)
  api/
    compile-intent/route.ts    # Intent Compiler  — English → Recipe (LLM)
    discover-schema/route.ts   # Schema Discovery — raw payload → SourceProfile (LLM)
    extract-records/route.ts   # Extraction — Slack/email prose → structured records (LLM)
    map/route.ts               # MOCK Mapping Engine (see below)
components/
  DescribeBox.tsx              # plain-English input → recipe
  SourcePanel.tsx              # sample tiles + paste/upload → discovery
  RecipePanel.tsx / ProfilePanel.tsx
  SyncFeed.tsx                 # mapped rows, confidence bars, rationales
  ConfirmCard.tsx              # human-in-the-loop for low-confidence fields
  AuditLog.tsx                 # one line per decision, auto vs user
lib/
  contract.ts                  # ★ shared type boundary with the Mapping Engine
  anthropic.ts                 # SDK client, model constant, defensive JSON parsing
  parseSource.ts               # JSON/CSV → records (quote-aware CSV splitting)
  mockContacts.ts              # fake Xero contact list for the mock mapper
public/mock/
  deals.json                   # CRM deals — clean + deliberately dirty rows
  unknown.csv                  # the cryptic-header "any source" demo
  payments.json                # Stripe-shaped payment events
  slack.json                   # #sales-wins thread — deals buried in chatter
  emails.json                  # inbox — deal confirmations in prose
```

## The integration contract

Everything that writes to Xero sits behind a single boundary. The **Mapping Engine + Xero Executor** is currently mocked by `app/api/map/route.ts`, which fuzzy-matches contacts, parses currency/dates, and assigns confidence heuristically.

The boundary is [`lib/contract.ts`](lib/contract.ts):

- The app **produces** `Recipe` and `SourceProfile`, and posts `{ recipe, profile, record }` per row.
- The app **renders** the returned `MappedPayload` (fields, confidences, rationales, contact match, `needs_confirmation`).

**Swapping in the real engine is a one-line change**: point the `/api/map` call at the real endpoint. Request and response shapes stay identical; nothing in the UI assumes the mapper is local. Field names in `contract.ts` are the shared contract and shouldn't change casually.

## Design notes

- **LLM calls never touch the browser** — both prompts run in server route handlers; responses are parsed defensively (fence-stripping, first-JSON-block fallback) and return a `422` with the raw text rather than crashing the UI.
- **Confidence is the product** — every mapped field carries a 0–1 score and a one-sentence rationale. The recipe's `confirm_below_confidence` guardrail (default 0.8) decides what auto-syncs and what waits for a human.
- **No browser storage** — all state lives in React state.
- **Deliberately dirty mock data** — the demo's messiness (inconsistent names, currency strings, ambiguous dates, missing fields) is the point: it exercises graceful degradation, not just the happy path.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · `@anthropic-ai/sdk` (Claude)
