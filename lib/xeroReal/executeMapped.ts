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

    const exec = await nodeExecutor.createInvoice({
      contactId: payload.contact.match === "existing" ? payload.contact.contact_id : undefined,
      contactName: payload.contact.name,
      status,
      date,
      lineItems: [{ description, quantity, unitAmount }],
    });

    return { id: exec.id, deep_link: exec.deepLink, status: exec.status };
  }

  if (payload.action === "create_payment") {
    const invoiceId = String(getField(payload, "Invoice.InvoiceID", "Invoice", "InvoiceID") ?? "");
    const accountCode = String(getField(payload, "Account.Code", "Account", "AccountCode") ?? "");
    const amount = Number(getField(payload, "Amount", "LineItem.Amount") ?? 0);
    const date = (getField(payload, "Date") as string) ?? todayISO();

    if (!invoiceId) {
      throw new Error("create_payment requires Invoice.InvoiceID");
    }

    const exec = await nodeExecutor.createPayment({ invoiceId, accountCode, amount, date });
    return { id: exec.id, deep_link: exec.deepLink, status: exec.status };
  }

  throw new Error(`Unsupported action: ${payload.action}`);
}
