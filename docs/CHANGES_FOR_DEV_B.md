# Changes to replicate on top of mainline (commit fe10781)

These are the hardening + learning features added after the "Pitch deck /
date-grounded LLM stages" commit. They span the in-process engine
(`lib/xeroReal/…`, `app/…`, `components/…`) AND the mirrored standalone
backend (`speaksync-dev-a/src/…`). Apply both so the two stay in sync.

Summary of what these add:
1. Persistent rule memory (learning survives across sessions).
2. "Challenge" button — reopen a synced row and forget the rule behind an
   over-confident / stale mapping.
3. Pre-write validation — reject missing/invalid amount and blank contact.
4. Idempotency is opt-in via an explicit event reference only (no content
   hashing → legitimate duplicate invoices are never blocked).
5. Real Xero validation errors surfaced verbatim.

---

## 1. NEW FILE — `lib/ruleMemory.ts`

Server-side JSON persistence of confirmed mappings.

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

export interface LearnedRule {
  key: string; // action|fieldName|sourceField
  action: string;
  field: string;
  sourceField: string | null;
  value: string | null;
  confirmedAt: string;
  timesApplied: number;
}

interface RuleFile {
  version: 1;
  users: Record<string, LearnedRule[]>;
}

const RULES_PATH =
  process.env.SPEAKSYNC_RULES_PATH || path.join(process.cwd(), ".speaksync-rules.json");

async function readFile(): Promise<RuleFile> {
  try {
    const raw = await fs.readFile(RULES_PATH, "utf8");
    const parsed = JSON.parse(raw) as RuleFile;
    if (parsed && parsed.version === 1 && parsed.users) return parsed;
  } catch {
    /* missing/corrupt — start fresh */
  }
  return { version: 1, users: {} };
}

async function writeFile(data: RuleFile): Promise<void> {
  await fs.writeFile(RULES_PATH, JSON.stringify(data, null, 2), "utf8");
}

function userKey(userId?: string): string {
  return (userId || "local").trim().toLowerCase();
}

export async function loadRules(userId?: string): Promise<LearnedRule[]> {
  const data = await readFile();
  return data.users[userKey(userId)] ?? [];
}

export async function deleteRule(key: string, userId?: string): Promise<boolean> {
  const data = await readFile();
  const uk = userKey(userId);
  const list = data.users[uk] ?? [];
  const next = list.filter((r) => r.key !== key);
  const removed = next.length !== list.length;
  if (removed) {
    data.users[uk] = next;
    await writeFile(data);
  }
  return removed;
}

export async function saveRule(
  rule: { action: string; field: string; sourceField: string | null; value: string | null },
  userId?: string,
): Promise<LearnedRule> {
  const data = await readFile();
  const uk = userKey(userId);
  const list = data.users[uk] ?? [];
  const key = `${rule.action}|${rule.field}|${rule.sourceField ?? ""}`;
  const existing = list.find((r) => r.key === key);
  let saved: LearnedRule;
  if (existing) {
    existing.value = rule.value;
    existing.confirmedAt = new Date().toISOString();
    existing.timesApplied += 1;
    saved = existing;
  } else {
    saved = {
      key, action: rule.action, field: rule.field, sourceField: rule.sourceField,
      value: rule.value, confirmedAt: new Date().toISOString(), timesApplied: 1,
    };
    list.push(saved);
  }
  data.users[uk] = list;
  await writeFile(data);
  return saved;
}
```

## 2. NEW FILE — `app/api/rules/route.ts`

GET (load), POST (save), DELETE (forget) for rule memory.

```ts
import { NextResponse } from "next/server";
import { loadRules, saveRule, deleteRule } from "@/lib/ruleMemory";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = url.searchParams.get("user") ?? undefined;
  try {
    return NextResponse.json({ rules: await loadRules(user) });
  } catch (err) {
    return NextResponse.json({ error: "Could not load rule memory", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: { user?: string; action?: string; field?: string; sourceField?: string | null; value?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.action || !body.field) return NextResponse.json({ error: "action and field are required" }, { status: 400 });
  try {
    const rule = await saveRule(
      { action: body.action, field: body.field, sourceField: body.sourceField ?? null, value: body.value ?? null },
      body.user,
    );
    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json({ error: "Could not save rule", detail: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  let body: { key?: string; user?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  try {
    return NextResponse.json({ removed: await deleteRule(body.key, body.user) });
  } catch (err) {
    return NextResponse.json({ error: "Could not delete rule", detail: String(err) }, { status: 500 });
  }
}
```

## 3. `lib/api.ts` — ADD three client helpers

Add after the `ExecutorUnavailableError` class (before `executePayload`):

```ts
export interface LearnedRule {
  key: string; action: string; field: string;
  sourceField: string | null; value: string | null;
  confirmedAt: string; timesApplied: number;
}

export async function loadRules(user?: string): Promise<LearnedRule[]> {
  if (IS_STATIC) return [];
  try {
    const res = await fetch(`/api/rules${user ? `?user=${encodeURIComponent(user)}` : ""}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { rules: LearnedRule[] };
    return data.rules ?? [];
  } catch { return []; }
}

export async function saveRule(rule: {
  user?: string; action: string; field: string; sourceField: string | null; value: string | null;
}): Promise<void> {
  if (IS_STATIC) return;
  try {
    await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rule) });
  } catch { /* non-fatal */ }
}

export async function forgetRule(key: string, user?: string): Promise<void> {
  if (IS_STATIC) return;
  try {
    await fetch("/api/rules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, user }) });
  } catch { /* non-fatal */ }
}
```

## 4. `app/page.tsx` — wire persistence + challenge

- Update the import from `@/lib/api` to also pull `loadRules, saveRule, forgetRule`.
- Add state next to `learnedRef`:
  ```ts
  const [rememberedCount, setRememberedCount] = useState(0);
  ```
- Add a mount effect (before the "glide to next step" effects):
  ```ts
  useEffect(() => {
    let cancelled = false;
    loadRules().then((rules) => {
      if (cancelled) return;
      for (const r of rules) learnedRef.current.add(r.key);
      setRememberedCount(rules.length);
    });
    return () => { cancelled = true; };
  }, []);
  ```
- In `confirmItem`, where a mapping is accepted as-is (the branch that does
  `learnedRef.current.add(...)`), also persist it:
  ```ts
  setRememberedCount((n) => n + 1);
  void saveRule({
    action: item.payload.action, field: f.name,
    sourceField: f.source_field, value: newValue,
  });
  ```
- Add a new `challengeItem` function (after `confirmItem`):
  ```ts
  function challengeItem(id: string) {
    const item = feed.find((it) => it.id === id);
    if (!item) return;
    let forgotten = 0;
    for (const f of item.payload.fields) {
      const key = learnedKey(item.payload.action, f.name, f.source_field);
      if (learnedRef.current.has(key)) {
        learnedRef.current.delete(key);
        setRememberedCount((n) => Math.max(0, n - 1));
        void forgetRule(key);
        forgotten += 1;
      }
    }
    const fields = item.payload.fields.map((f) => ({
      ...f, confidence: Math.min(f.confidence, 0.5),
      rationale: "Flagged by you as incorrect — please review and correct.",
    }));
    const reopened: MappedPayload = {
      ...item.payload, fields, overall_confidence: 0.5, needs_confirmation: true,
    };
    logAudit(
      "challenged",
      `User challenged ${item.payload.action} for ${item.payload.contact.name}` +
        (forgotten > 0 ? ` — forgot ${forgotten} learned rule(s) so it won't repeat.` : ".") +
        (item.execute?.state === "done" ? " The Xero record was already written — edit it in Xero." : ""),
      item.execute?.deepLink,
    );
    setFeed((prev) => prev.map((it) =>
      it.id === id ? { ...it, payload: reopened, status: "pending" as const, execute: undefined } : it));
  }
  ```
- Pass `onChallenge={challengeItem}` to `<SyncFeed>`.
- (Optional) Show a chip near the sync controls:
  ```tsx
  {rememberedCount > 0 && <Chip tone="purple">{rememberedCount} remembered rules</Chip>}
  ```

## 5. `components/SyncFeed.tsx` — add Challenge button

- Extend props:
  ```ts
  interface SyncFeedProps {
    items: SyncItem[];
    threshold: number;
    onConfirm: (id: string, edits: { name: string; value: string }[]) => void;
    onChallenge?: (id: string) => void;
  }
  export default function SyncFeed({ items, threshold, onConfirm, onChallenge }: SyncFeedProps) {
  ```
- In the row header (right before the `<span className="ml-auto">` confidence
  badge), add:
  ```tsx
  {status === "synced" && item.execute?.state !== "writing" && onChallenge && (
    <button
      onClick={() => onChallenge(id)}
      title="Mark this mapping as wrong — reopens it and forgets any learned rule behind it"
      className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-300 transition-colors hover:bg-red-500/20"
    >
      ⚑ Challenge
    </button>
  )}
  ```

## 6. `components/AuditLog.tsx` — support "challenged" kind

- Widen the union: `kind: "auto" | "confirmed" | "challenged";`
- In the kind label span, colour + label it:
  ```tsx
  className={`shrink-0 ${
    e.kind === "auto" ? "text-teal-400"
    : e.kind === "challenged" ? "text-red-400"
    : "text-amber-400"
  }`}
  // label: e.kind === "auto" ? "auto" : e.kind === "challenged" ? "challenge" : "user"
  ```

## 7. `lib/xeroReal/executor.ts` — idempotency + error helper

- Add an exported helper `xeroErrorMessage(err)` that pulls
  `err.response.body.Elements[].ValidationErrors[].Message` (and top-level
  `ValidationErrors`, then `Message`) so real Xero errors surface; falls back
  to `err.message`.
- Add `reference?: string;` to `CreateInvoiceInput`.
- Add method `findInvoiceByReference(contactId, reference)`: query
  `getInvoices` with where =
  `Contact.ContactID==guid("<id>") AND Reference=="<ref>" AND Status!="DELETED"`,
  return `{ id, deepLink, status }` or null (swallow query errors → null).
- In `createInvoice`: after resolving `contactId`, if `input.reference` set,
  return `findInvoiceByReference(...)` result when found (dedupe). Wrap the
  `createInvoices` call in try/catch → `throw new Error("Xero rejected the
  invoice: " + xeroErrorMessage(err))`. Pass `reference: input.reference` in
  the invoice object.
- In `createPayment`: wrap `createPayments` in the same try/catch with
  `xeroErrorMessage`.

## 8. `lib/xeroReal/executeMapped.ts` — validation + opt-in reference

Replace the create_invoice block body with:

```ts
const contactName = (payload.contact.name ?? "").trim();
if (!contactName) throw new Error("Cannot create invoice: no customer name was resolved from the record.");
if (!Number.isFinite(unitAmount) || unitAmount <= 0)
  throw new Error(`Cannot create invoice for ${contactName}: amount is missing or invalid.`);

// Idempotency is OPT-IN via an explicit reference identifying the SAME event.
// No content-hash dedup — legitimate duplicate invoices must both write.
const reference = ((getField(payload, "Reference") as string) || "").trim() || undefined;

const exec = await nodeExecutor.createInvoice({
  contactId: payload.contact.match === "existing" ? payload.contact.contact_id : undefined,
  contactName, status, date, reference,
  lineItems: [{ description, quantity, unitAmount }],
});
```

In the create_payment block, after the `!invoiceRef` check add:
```ts
if (!Number.isFinite(amount) || amount <= 0)
  throw new Error(`Cannot record payment against ${invoiceRef}: amount is missing or invalid.`);
```

## 9. Mirror to the standalone backend (`speaksync-dev-a/src/…`)

Same logic in the Express copy so both engines match:
- `src/xero/executor.ts` — add `reference?: string` to `CreateInvoiceInput`;
  add `findInvoiceByReference` to the `Executor` interface.
- `src/xero/executor.node.ts` — add `xeroErrorMessage`, `findInvoiceByReference`,
  the reference dedupe in `createInvoice`, and try/catch error wrapping on
  invoice + payment creates.
- `src/routes/execute.ts` — validate contact name + amount (return 400 with a
  clear message); use opt-in `Reference` only (drop any content-hash fallback);
  add amount validation to the payment branch.

## 10. `.gitignore` — add the local memory file

```
.speaksync-rules.json
```

---

## Verification (all passed locally against live Xero Demo Company)

- Idempotency: same explicit reference → same invoice id; two invoices with NO
  reference → both created (no false-positive dedup).
- Validation: missing amount and blank contact → 400 before any Xero write.
- Challenge: saveRule then deleteRule round-trips; forgotten rule no longer
  auto-applies.
- `tsc --noEmit` clean on both the Next app and `speaksync-dev-a`.
