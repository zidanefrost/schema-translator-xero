# Make scenario — Slack message → draft Xero invoice

How the Make.com scenario plugs into this backend, module by module.

## The one thing to understand first

Make does **not** call Xero or Anthropic. It is only an orchestrator that
makes **two HTTP calls** to this service — `/map` and `/execute` — exactly
like Dev B's frontend does. The entire integration surface between Make and
the backend is those two HTTP modules. Everything Xero-related happens
inside `/map` (Claude reasoning + contact resolution) and `/execute` (the
real Xero write).

```
Slack ──▶ Make (Slack trigger, build JSON, 2x HTTP, router, Block Kit) ──▶ this backend ──▶ Xero
```

Because Make is cloud-hosted and this service runs on localhost, you expose
it with ngrok and use that URL as DEV_A_BASE_URL in the HTTP modules.

## Prerequisites

1. Backend running locally: `npm start` (listening on :3000).
2. Public tunnel: `ngrok http 3000` → note the `https://<sub>.ngrok-free.app` URL.
3. A Slack workspace + a channel to watch, and a Make Slack connection
   (Make walks you through the Slack OAuth).
4. `ANTHROPIC_API_KEY` set in the backend `.env` (so `/map` works).

Set `DEV_A_BASE_URL = https://<sub>.ngrok-free.app` (no trailing slash).
Every time you restart ngrok on the free tier the URL changes — update the
two HTTP modules when it does.

## Modules in order

### 1. Slack — "Watch Public Channel Messages" (trigger)
- Connection: your Slack workspace.
- Channel: the channel to watch.
- This emits one bundle per new message.

### 2. Filter — drop bot messages (prevents self-loops)
Between module 1 and 3, set a filter condition:
- Condition: `bot_id` **Does not exist**  (and optionally `subtype` is empty)
- Without this, the scenario's own Slack replies re-trigger it → infinite loop.

### 3. Tools — "Set variable" or a JSON module: build the /map body
Build exactly this shape (freetext recipe + profile are hardcoded; only the
message text is dynamic):

```json
{
  "recipe": {
    "name": "Slack message to draft invoice",
    "trigger": { "source": "slack", "event": "message" },
    "target": { "system": "xero", "action": "create_invoice" },
    "intent": "Create a draft invoice from a free-text message describing a completed job and payment",
    "entity_resolution": { "entity": "customer", "match_on": "name" },
    "guardrails": { "invoice_status": "DRAFT", "confirm_below_confidence": 0.8 }
  },
  "profile": { "detected_format": "freetext", "fields": [] },
  "record": { "text": "{{1.text}}" }
}
```
`{{1.text}}` = the message text from the Slack trigger (module 1).

### 4. HTTP — "Make a request": POST to /map
- URL: `{{DEV_A_BASE_URL}}/map`
- Method: POST
- Headers: `Content-Type: application/json`
- Body type: Raw / JSON → the body from module 3.
- Parse response: Yes (so later modules can read fields).
- Response is a `MappedPayload`: `action, fields[], contact, overall_confidence, needs_confirmation`.

### 5. Router — branch on needs_confirmation
Two routes off the HTTP module:

- **Route A — auto-sync** (`needs_confirmation` = `false`): go straight to module 6 (execute).
- **Route B — needs a human** (`needs_confirmation` = `true`):
  1. Slack "Create a Message" in the same thread (`thread_ts` = `{{1.ts}}`),
     using Block Kit: show each mapped field + value, mark the ones whose
     `confidence` is below 0.8, and add two buttons: **Confirm** / **Edit**.
  2. Wait for the button click. On the free/standard plan Make can't "pause"
     a run mid-scenario, so the clean way is a SECOND scenario:
     - Slack interactivity (button click) → a Make custom webhook.
     - That webhook scenario reads the (possibly edited) payload and calls
       module 6 (`/execute`) itself.
     - Simplest hackathon version: the "Confirm" button posts the payload
       straight through; "Edit" opens a Slack modal that lets the user fix
       the flagged field, then submits to the same webhook.

> Demo tip: if wiring the interactive button round-trip is too fragile for
> the live run, a reliable fallback is to have Route B post the mapped
> fields for visibility and still proceed — but be honest that the
> human-gate is the product, so it's worth getting at least the Confirm
> button working on a demo message that reliably scores low (email fixture
> #3 style: missing amount).

### 6. HTTP — "Make a request": POST to /execute
- URL: `{{DEV_A_BASE_URL}}/execute`
- Method: POST
- Headers: `Content-Type: application/json`
- Body: the `MappedPayload` from module 4 (Route A) or the human-edited
  payload (Route B).
- Response: `{ id, deep_link, status }` — the real draft invoice.

### 7. Slack — "Create a Message": confirmation reply
- Same thread: `thread_ts` = `{{1.ts}}`.
- Text: `✅ Draft invoice created in Xero for {{contact name}} — {{6.deep_link}}`

## Testing without Slack first

Prove the two HTTP calls with curl against the ngrok URL before adding Slack:
```bash
curl -s https://<sub>.ngrok-free.app/map -H "content-type: application/json" -d '{
  "recipe": { "name":"Slack message to draft invoice","trigger":{"source":"slack","event":"message"},"target":{"system":"xero","action":"create_invoice"},"intent":"...","entity_resolution":{"entity":"customer","match_on":"name"},"guardrails":{"invoice_status":"DRAFT","confirm_below_confidence":0.8} },
  "profile": { "detected_format":"freetext","fields":[] },
  "record": { "text":"invoice Riverside Cafe for a kitchen refit deposit, 500 quid" }
}'
```
Take the returned MappedPayload and POST it to `/execute`. If both work via
ngrok, the Make scenario is just clicking those same two calls together.

## Email variant

The email scenario is identical — swap module 1 for Make's Email/Gmail/IMAP
"Watch emails" trigger, and put the email body into `record.text` in module
3. Same `/map` → router → `/execute` → reply flow. The backend needs no
changes; the mapping prompt already strips signatures and quoted replies.
