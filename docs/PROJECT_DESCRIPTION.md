# SpeakSync — project description

**One sentence:** SpeakSync lets anyone point at *any* source of business data —
a CSV with cryptic headers, a Stripe-shaped webhook, even a Slack thread or an
email inbox — describe in plain English what should happen in Xero, and watch
real draft invoices and payments appear in Xero, confidence-scored, explained,
and human-approved wherever the AI was unsure.

**Live app:** https://schema-translator-xero.vercel.app (full pipeline, real LLM + real Xero)
**Static demo:** https://zidanefrost.github.io/schema-translator-xero/ (zero-backend, canned AI)
**Repo:** https://github.com/zidanefrost/schema-translator-xero

Built for the Xero App & Agent Hackathon, **Bounty 02: "The Vibe Integrator"** —
*"show how AI can replace brittle integration logic with adaptive, context-aware syncing."*

---

## The problem

Businesses run on tools that don't talk to each other, and the traditional fix
— rigid if-this-then-that connectors — breaks exactly where reality begins:
a renamed column, `"£1,200.00"` instead of `1200`, `"04/07/2026"` that could be
July or April, a customer called `"acme ltd"` in one system and `"Acme Limited"`
in another, or a deal that only exists as a Slack message. Every new source
means another hand-built, hand-maintained connector.

## The idea

SpeakSync has **no connectors at all**. It understands data instead of
expecting it, using three LLM stages around one deterministic core:

1. **Intent Compiler** — one English sentence ("For each closed deal, create a
   draft invoice in Xero for that customer") becomes a typed *Recipe*: trigger,
   Xero action, entity-resolution rule, and guardrails (draft-by-default,
   confirm-below-confidence 0.8).
2. **Schema Discovery** — any pasted or selected payload is profiled at
   runtime: every field gets an inferred type and a plain-English semantic
   label (`cust_nm` → "customer name", `amt_gbp` → "amount in GBP").
   Unstructured sources (Slack threads, emails) first pass through an
   **extraction stage** that turns prose into records — ignoring chatter and
   preserving human hedges ("i think close date was july 1st?") as
   low-confidence notes.
3. **Mapping Engine** — Claude maps each record to Xero fields with a
   per-field **confidence score and one-sentence rationale**, resolving the
   customer against the *live* Xero contact list ("acme ltd" → the real Acme
   Limited contact GUID; match by name or email).

A **deterministic Executor** (no LLM) then performs the writes via the Xero
API, and a **human-in-the-loop gate** catches anything below the confidence
guardrail: a confirm card shows only the uncertain fields, with the AI's
reasoning, for one-click accept or edit.

## What makes it adaptive

- **It learns.** Accepting a mapping as-is persists a rule (server-side JSON
  memory, survives sessions). The same low-confidence mapping auto-applies on
  every later run — *"Auto-applied — you confirmed this mapping earlier."*
- **It unlearns.** A **Challenge** button on any synced row reopens it, drops
  its confidence, and deletes the learned rules behind it, so a bad
  generalisation never repeats. Every challenge is audit-logged.
- **Watch mode** simulates live events arriving from the source every few
  seconds — records map, confirm, and sync themselves while you watch.
- **Scramble-proof.** A 🎲 button randomises the demo CSV's column names and
  rediscovers — live proof that nothing is keyed to known headers.

## Safety and honesty

- **Validation before writes**: a blank contact or missing/invalid amount is
  rejected with a clear message before any Xero call.
- **Zero duplicate contacts**: entity resolution proposes; the executor
  re-checks by name/email immediately before any create.
- **Opt-in idempotency**: an explicit source reference (e.g. a PO number)
  makes reruns return the existing invoice instead of duplicating — while
  *legitimate* duplicates (no reference) are never silently blocked.
- **Verbatim Xero errors**: real `ValidationErrors` from the API surface in
  the UI instead of generic failures.
- **Honest degradation**: with no Xero credentials configured, rows are
  clearly labelled *simulated* — the app never fakes a Xero link.
- **Full audit log**: every auto-sync, confirmation, and challenge is a
  timestamped one-liner with a deep link into Xero.

## How we use the Xero API

**Auth:** OAuth 2.0 **client-credentials** via a **Custom Connection**
(machine-to-machine, no redirect flow), scoped to a single organisation (the
Xero Demo Company). Tokens are cached ~30 minutes; the tenant is resolved once
via `/connections`. All secrets stay server-side (.env / Vercel encrypted env).

**Accounting API endpoints (through the `xero-node` SDK):**

| Call | Purpose |
| --- | --- |
| `POST identity.xero.com/connect/token` | client-credentials token |
| `GET /connections` | resolve the connected tenant |
| `GET /Contacts` | candidate contacts for LLM entity resolution |
| `PUT /Contacts` | create-if-new contact (after dedup re-check) |
| `PUT /Invoices` | create DRAFT/AUTHORISED ACCREC invoices |
| `GET /Invoices` (by `InvoiceNumbers`, by `Reference` where-clause) | payment-target lookup; opt-in idempotency |
| `PUT /Payments` | record payments against AUTHORISED invoices |
| `GET /Accounts?where=Type=="BANK"` | payment account (graceful fallback to code 090) |

**OAuth 2.0 scopes required:** `accounting.contacts`,
`accounting.contacts.read`, `accounting.invoices`, `accounting.invoices.read`,
`accounting.payments`, `accounting.payments.read`.
Optional: `accounting.settings.read` (bank-account lookup; the executor
degrades to a configurable default account code without it).

## Architecture

```
Next.js app (Vercel) ── UI + three LLM routes (Anthropic, server-side)
      │
      ├── /api/map ──►  1) DEV_A_BASE_URL proxy (standalone Express service)
      │                 2) in-process real engine (Claude + live Xero contacts)
      │                 3) local mock (offline / static demo)
      ├── /api/execute ─ same three modes ─►  deterministic Executor (xero-node)
      └── /api/rules ──  persistent learned-rule memory
```

Everything speaks one contract — `{recipe, profile, record}` →
`MappedPayload` → `{id, deep_link, status}` — so the mock, the in-process
engine, and the teammate's standalone service are interchangeable, and the
executor interface is ready for a Xero MCP server implementation to drop in.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Anthropic Claude
(`claude-sonnet-5`) · `xero-node` (Custom Connection) · Express (standalone
Dev A service) · Vercel + GitHub Pages.

## Team

Built by Zidane & teammate for the Xero App & Agent Hackathon, with Claude as
a development partner.
