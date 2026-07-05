import { nodeExecutor } from "./executor";
import type { ExecuteResult, MappedPayload } from "@/lib/contract";

// Turn a confirmed MappedPayload into real Xero writes — ported from
// speaksync-dev-a/src/routes/execute.ts so the Next app can execute
// in-process when no external Dev A service is configured.

// Normalise a Xero field name so the naming conventions in play all collapse
// to the same key: schema ("LineItems[].UnitAmount"), LLM output
// ("LineItems.UnitAmount"), and the mock ("LineItem.Amount").
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[\]/g, "")
    .replace(/[.\s_]/g, "")
    .replace(/lineitems/g, "lineitem");
}

function getField(payload: MappedPayload, ...aliases: string[]): string | number | null {
  const targets = aliases.map(normaliseName);
  const field = payload.fields.find((f) => targets.includes(normaliseName(f.name)));
  return field ? field.value : null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function executeMappedPayload(payload: MappedPayload): Promise<ExecuteResult> {
  if (payload.action === "create_invoice" || payload.action === "create_bill") {
    const status = (getField(payload, "Status") as "DRAFT" | "AUTHORISED") ?? "DRAFT";
    const date = (getField(payload, "Date") as string) ?? todayISO();
    const description =
      (getField(payload, "LineItems.Description", "LineItem.Description") as string) ?? "";
    const quantity = Number(getField(payload, "LineItems.Quantity", "LineItem.Quantity") ?? 1) || 1;
    const unitAmount = Number(
      getField(payload, "LineItems.UnitAmount", "LineItem.UnitAmount", "LineItem.Amount", "Amount") ?? 0,
    );

    const contactName = (payload.contact.name ?? "").trim();
    if (!contactName) {
      throw new Error("Cannot create invoice: no customer name was resolved from the record.");
    }
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error(`Cannot create invoice for ${contactName}: amount is missing or invalid.`);
    }

    // Idempotency is OPT-IN via an explicit reference identifying the SAME
    // source event. No content-hash dedup - legitimate duplicates must write.
    const reference = ((getField(payload, "Reference") as string) || "").trim() || undefined;

    const exec = await nodeExecutor.createInvoice({
      contactId: payload.contact.match === "existing" ? payload.contact.contact_id : undefined,
      contactName,
      status,
      date,
      reference,
      lineItems: [{ description, quantity, unitAmount }],
    });

    return { id: exec.id, deep_link: exec.deepLink, status: exec.status };
  }

  if (payload.action === "create_payment") {
    const invoiceRef = String(getField(payload, "Invoice.InvoiceID", "Invoice", "InvoiceID", "InvoiceNumber") ?? "");
    let accountCode = String(getField(payload, "Account.Code", "Account", "AccountCode") ?? "");
    const amount = Number(getField(payload, "Amount", "LineItem.Amount") ?? 0);
    const date = (getField(payload, "Date") as string) ?? todayISO();

    if (!invoiceRef) {
      throw new Error("create_payment requires an invoice reference");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Cannot record payment against ${invoiceRef}: amount is missing or invalid.`);
    }

    // The mapper usually emits an invoice NUMBER (e.g. "INV-0043"), not a
    // Xero GUID — resolve it. Payments only apply to AUTHORISED invoices.
    const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceRef);
    let invoiceId = invoiceRef;
    if (!isGuid) {
      const found = await nodeExecutor.findInvoiceByNumber(invoiceRef);
      if (!found) {
        throw new Error(`No invoice found in Xero with number "${invoiceRef}"`);
      }
      if (found.status !== "AUTHORISED") {
        throw new Error(
          `Invoice ${invoiceRef} is ${found.status} — Xero only accepts payments against AUTHORISED invoices`,
        );
      }
      invoiceId = found.invoiceId;
    }

    // "Stripe Clearing" etc. aren't real account codes — resolve to the
    // org's first bank account when the mapped code isn't numeric-ish.
    if (!/^\d{2,4}$/.test(accountCode)) {
      accountCode = await nodeExecutor.getDefaultPaymentAccountCode();
    }

    const exec = await nodeExecutor.createPayment({ invoiceId, accountCode, amount, date });
    return { id: exec.id, deep_link: exec.deepLink, status: exec.status };
  }

  throw new Error(`Unsupported action: ${payload.action}`);
}
