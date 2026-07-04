# SpeakSync Dev A — Handoff

The backend that both demos (CSV frontend + Slack/email via Make) sit behind.
Every Xero write and every LLM call goes through here. This doc is everything
you need to run it, test it, and integrate against it.

## TL;DR — plug in keys and test

```bash
npm install
copy .env.example .env      # Windows (use cp on macOS/Linux)
# put your real keys in .env: XERO_CLIENT_ID, XERO_CLIENT_SECRET, ANTHROPIC_API_KEY

npm run smoke:contacts      # 1. proves Xero auth (no server needed)
npm start                   # 2. starts the service on :3000  (leave running)
npm run smoke:map           # 3. in a 2nd terminal — proves the LLM /map step
```

If all three pass, the backend is fully working end to end.

## What's already proven

- ✅ Xero auth (Custom Connection, client-credentials) — lists 52 real contacts.
- ✅ `/execute` — created real DRAFT invoices in the connected org twice.
- ✅ `/execute` tolerates field-name variants (LLM, our schema, and the
  frontend mock all use slightly different names — all handled).
- ⏳ `/map` — code complete, needs a real ANTHROPIC_API_KEY to verify. This
  is the ONLY unproven part. Run `npm run smoke:map` once the key is in.

## Endpoints

| Method | Path       | Body                          | Returns                     |
|--------|------------|-------------------------------|-----------------------------|
| GET    | `/health`  | —                             | `{ ok: true }`              |
| POST   | `/map`     | `{ recipe, profile, record }` | `MappedPayload`             |
| POST   | `/execute` | `MappedPayload`               | `{ id, deep_link, status }` |

- `/map` = the reasoning step: Claude extracts + confidence-scores the Xero
  fields and resolves the customer against REAL Xero contacts.
- `/execute` = the write step: deterministic Xero write, no LLM. Only run it
  after the confidence gate (see below) is satisfied.

## The contract (shared boundary — must match the frontend's `lib/contract.ts`)

- Frontend/Make **produces** `Recipe` + `SourceProfile` + a raw `record` and
  POSTs `{ recipe, profile, record }` to `/map`.
- `/map` **returns** a `MappedPayload`: `action`, `fields[]` (each with
  `name`, `value`, `source_field`, `confidence` 0–1, `rationale`), `contact`,
  `overall_confidence`, and `needs_confirmation`.
- The **possibly human-edited** `MappedPayload` is POSTed to `/execute`.

Do not rename contract fields without telling both sides.

## The confidence gate (the product's core behaviour)

Every field gets a `confidence` (0–1) and a one-line `rationale`. The recipe's
`guardrails.confirm_below_confidence` (default 0.8) is the threshold. If ANY
field is below it, `/map` returns `needs_confirmation: true`. The caller
(frontend `ConfirmCard` or Make Block Kit buttons) must then let a human
accept/edit before calling `/execute`.

When you test `/map`, the thing to verify is: **messy/ambiguous inputs should
drop below 0.8 and set `needs_confirmation: true`**. Clean inputs should sail
through. `npm run smoke:map` prints exactly this summary.

## Environment variables

| Var                  | Purpose                                   | Notes                          |
|----------------------|-------------------------------------------|--------------------------------|
| `XERO_CLIENT_ID`     | Custom Connection app                     | shared app; one org            |
| `XERO_CLIENT_SECRET` | Custom Connection app                     | regenerate after the event     |
| `ANTHROPIC_API_KEY`  | LLM calls in `/map`                        | personal to whoever runs it    |
| `SPEAKSYNC_MODEL`    | Claude model id                           | default `claude-3-5-sonnet-latest` |
| `PORT`               | server port                               | default 3000                   |

If `/map` returns a 500 mentioning the model, `SPEAKSYNC_MODEL` isn't a model
your Anthropic account can access — change it to one that is.

## Test data (fixtures/)

- `recipe.slack.json` + `profile.freetext.json` — the freetext (Slack/email) setup.
- `records.freetext.json` — short Slack-style messages.
- `records.email.json` — 3 email cases: clean, noisy (signature + quoted
  reply), and ambiguous (no amount → should trigger confirmation).
- `recipe.invoice.json` / `profile.deals.json` / `records.clean.json` /
  `records.dirty.json` — the structured CSV path.

Try any of them:
```bash
npm run smoke:map -- "invoice City Agency for a website audit, 920 quid"
```

## Frontend integration status

The frontend PR (`integrate-dev-a-real-service` branch on the frontend repo)
already:
- points `/api/map` at `DEV_A_BASE_URL/map` (mock fallback if unset), and
- adds `/api/execute` + an `executePayload()` client helper.

**Still TODO on the frontend:** actually call `executePayload()` when a row
auto-syncs or after a ConfirmCard is accepted, and show the returned
`deep_link`. Set `DEV_A_BASE_URL` in the frontend's `.env.local` to the
backend URL (localhost during dev, the ngrok URL for Make).

## Make (Slack / email) integration

Make calls the same two endpoints over HTTP — see
`docs/make-slack-scenario.md`. Requires `ngrok http 3000` to expose localhost
to Make's cloud.

## Good to know

- The connected Xero org is shared: invoices you create during testing land
  in the same org as everyone else using these credentials. Expect to see
  each other's test drafts.
- Drafts are harmless (not sent to anyone) and can be deleted in Xero.
- `.env` is gitignored; don't commit it. `node_modules` isn't shared — run
  `npm install` locally.
