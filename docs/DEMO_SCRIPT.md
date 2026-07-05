# SpeakSync — 3-minute demo script

**Presenter setup (before you're called):** live site open at
https://schema-translator-xero.vercel.app, scrolled to the hero. A second tab
logged into the Xero Demo Company on the Invoices screen. Close everything else.

---

## Beat 1 — Say it (0:00–0:30)

> "Every integration you've ever used broke the day someone renamed a column.
> SpeakSync has no connectors to break — you just tell it what you want."

- Click **Start building**.
- Click the example chip: *"For each closed deal, create a draft invoice in Xero for that customer."*
- While it compiles (live Claude call): "That sentence is being compiled into a
  typed recipe — trigger, Xero action, how to match the customer, and a
  confidence guardrail."
- Point at the recipe card: **create_invoice · DRAFT · confirm below 80%**.

## Beat 2 — Mystery CSV (0:30–1:00)

> "Now the data. We've never seen this file — cryptic headers, messy values."

- Click the **Mystery CSV** tile (auto-discovers).
- Point at the profile table: "`cust_nm` → customer name, `amt_gbp` → amount in
  GBP. Nothing was configured — the schema was discovered at runtime."

## Beat 3 — Run sync → real Xero (1:00–1:40)

- Click **Run sync · 3 records**.
- "Every field gets a confidence score and a one-sentence rationale. 'GLOBEX
  trading' matched the real Xero contact. '£1,200.00' became 1200."
- Click **View in Xero ↗** on a synced row → the Xero tab shows the real draft
  invoice. **Pause. Let them see it.**
> "That is not a mock. That's a draft invoice in Xero, created by a sentence."

## Beat 4 — The human moment + it learns (1:40–2:20)

- Point at the amber row: "04/07/2026 — July 4th or April 7th? Below the
  guardrail, it *stops and asks* instead of guessing."
- Click **Confirm & sync** (accept as-is).
- Click **Run sync** again: "Same file — but no question this time. It
  *learned* from that confirmation." Point at *"Auto-applied — you confirmed
  this mapping earlier."*

## Beat 5 — Prove nothing is canned (2:20–3:00)

Pick ONE depending on time:

- **Scramble:** click **🎲 scramble the CSV headers** → columns get random
  names → discovery still labels them → run still works.
  > "You can rename every column. There's nothing to break."
- **Second integration:** click the recipe summary → chip *"When a Stripe
  payment succeeds…"* → **Stripe payments** tile → Run → a **real £900
  payment** lands against invoice INV-1043 in Xero.
- **Unstructured (crowd-pleaser):** *"When a deal closes, invoice the
  customer"* → **Email inbox** tile → three invoices from plain-English
  emails. "It read the inbox, ignored the noise, and kept a colleague's 'i
  think it was july 1st?' as a low-confidence flag for a human."

**Close:**
> "Three LLM stages decide meaning. A deterministic executor does the writing.
> A human approves anything uncertain — and the system learns from every
> approval. Adaptive, context-aware syncing — not another brittle pipe."

---

## If a judge wants to drive

Invite them to paste **their own** CSV/JSON — or any email text — into the
paste box ("It's messages / emails" for prose). Live discovery + extraction
handles arbitrary input. This is the strongest 30 seconds available: their
data, zero configuration.

## Fallback ladder (rehearse once)

1. **Venue wifi dies** → `npm run dev` locally; identical app at localhost:3000.
2. **Xero is down / creds fail** → rows show "synced · simulated" clearly —
   narrate: "executor's offline, note it degrades honestly, no fake links."
3. **LLM slow** → keep talking through the pipeline diagram; responses land in
   a few seconds.

## Morning-of checklist

- [ ] `cd speaksync-dev-a && npx tsx scripts/seed-contacts.ts`
      (contacts + INV-1042/1043; rerun-safe; Demo Company resets ~monthly)
- [ ] Load the live site once (warms Vercel + cache)
- [ ] Run one full invoice pass + one payment pass yourself
- [ ] Xero Demo Company tab logged in, on Invoices
- [ ] Local `npm run dev` running as backup
