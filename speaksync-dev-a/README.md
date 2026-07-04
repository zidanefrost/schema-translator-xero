# SpeakSync — Dev A service (Xero Executor + Mapping Engine)

The single backend behind both demos. Every Xero write and every LLM call
goes through here, so there is exactly one real Xero integration:

- **CSV demo** (Dev B's app) → calls `/map` then `/execute`
- **Slack demo** (Make scenario) → calls `/map` then `/execute`

Make and Dev B never touch the Xero API or Anthropic directly.

## Endpoints

| Method | Path       | Body                          | Returns                          |
|--------|------------|-------------------------------|----------------------------------|
| GET    | `/health`  | —                             | `{ ok: true }`                   |
| POST   | `/map`     | `{ recipe, profile, record }` | `MappedPayload`                  |
| POST   | `/execute` | `MappedPayload`               | `{ id, deep_link, status }`      |

`/map` extracts + scores fields with Claude and resolves the customer
against real Demo Company contacts. `/execute` performs the deterministic
Xero write (no LLM). `MappedPayload.needs_confirmation` is the human-gate
flag Make/Dev B use to decide whether to ask before executing.

## Setup

1. `npm install`
2. `copy .env.example .env` (Windows) and fill in the three secrets below.
3. `npm run smoke:contacts` — proves Xero auth works (Phase 1).
4. `npm start` — boots the service on `http://localhost:3000`.

### Required credentials

| Var                 | Where to get it                                                        |
|---------------------|------------------------------------------------------------------------|
| `XERO_CLIENT_ID`     | developer.xero.com/myapps → new **Custom Connection** app             |
| `XERO_CLIENT_SECRET` | same app → "Generate a secret"                                        |
| `ANTHROPIC_API_KEY`  | console.anthropic.com → API keys                                      |

The Custom Connection must be authorised against the **Xero Demo Company**
by someone with access to that org, and needs the
`accounting.contacts` + `accounting.transactions` scopes.

> Verify `SPEAKSYNC_MODEL` in `.env` matches a current Anthropic model id.

## Project layout

```
src/
  index.ts              Express app, wires /map and /execute
  contract.ts           Shared types — must match Dev B byte-for-byte
  lib/anthropic.ts      Anthropic client + defensive JSON parsing
  mapping/
    engine.ts           Calls Claude, returns a MappedPayload
    prompt.ts           Mapping Engine system prompt
  xero/
    schema.ts           Minimal Xero field reference per action
    auth.ts             Custom Connection (client-credentials) auth
    executor.ts         Executor interface (deterministic writes)
    executor.node.ts    xero-node implementation
  routes/
    map.ts              POST /map
    execute.ts          POST /execute
scripts/
  smoke-xero.ts         Phase 1 auth + list-contacts smoke test
fixtures/               Sample recipes, profiles, and records for curl tests
```

## Local test with curl (before Make is involved)

```bash
# 1. Map a free-text Slack-style message
curl -s http://localhost:3000/map -H "content-type: application/json" -d '{
  "recipe": '"$(cat fixtures/recipe.slack.json)"',
  "profile": '"$(cat fixtures/profile.freetext.json)"',
  "record": { "text": "invoice Riverside Cafe for a kitchen refit deposit, 500 quid" }
}'

# 2. Take that MappedPayload and execute it
curl -s http://localhost:3000/execute -H "content-type: application/json" -d '<mapped payload from step 1>'
```

## Exposing to Make (ngrok)

Only needed once the Make scenario needs to reach this service:

```bash
ngrok http 3000
```

Use the `https://…ngrok…` URL as `DEV_A_BASE_URL` in Make.

## Teammate handoff / setup

Passing this folder to someone else? Here's the minimal setup on their end.

1. **Don't copy `node_modules/`** — it's large and platform-specific. They
   run `npm install` fresh.
2. **`.env` is gitignored**, so it won't travel via a git clone/export.
   Either include it in the copy or have them recreate it from
   `.env.example`.
3. Steps for them:
   ```
   npm install
   copy .env.example .env      # then fill in the keys
   npm run smoke:contacts      # confirm Xero auth works
   npm start
   ```

### About the credentials when shared

- **Xero client ID + secret** are tied to the app and its organisation, not
  to a machine — the same values authenticate from any computer. Note that
  a Custom Connection is bound to ONE organisation, so everyone using these
  credentials writes into the **same** Xero org. Fine for shared testing.
- **Anthropic key** is personal and billed to whoever owns it. Each person
  uses their own `ANTHROPIC_API_KEY`; it is not shared the way the Xero
  credentials are.
- The Xero secret should be **regenerated** in developer.xero.com after the
  event, since it will have been shared around.
