import { Router } from "express";
import { nodeExecutor } from "../xero/executor.node";
import type { MappedPayload, ExecuteResult } from "../contract";

export const executeRouter = Router();

// Normalise a Xero field name so the three naming conventions in play all
// collapse to the same key: our schema ("LineItems[].UnitAmount"), what the
// LLM tends to emit ("LineItems.UnitAmount"), and Dev B's mock
// ("LineItem.Amount"). Lower-cased, brackets/dots/spaces stripped, and
// "lineitems" singularised to "lineitem".
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[\]/g, "")
    .replace(/[.\s_]/g, "")
    .replace(/lineitems/g, "lineitem");
}

// Look up a field value by any of several accepted aliases. First match wins.
function getField(
  payload: MappedPayload,
  ...aliases: string[]
): string | number | null {
  const targets = aliases.map(normaliseName);
  const field = payload.fields.find((f) => targets.includes(normaliseName(f.name)));
  return field ? field.value : null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

executeRouter.post("/", async (req, res) => {
  const payload = req.body as MappedPayload;

  if (!payload?.action || !Array.isArray(payload.fields) || !payload.contact) {
    return res.status(400).json({
      error: "Request must be a MappedPayload — { action, fields, contact, ... }",
    });
  }

  try {
    let result: ExecuteResult;

    if (payload.action === "create_invoice") {
      const status = (getField(payload, "Status") as "DRAFT" | "AUTHORISED") ?? "DRAFT";
      const date = (getField(payload, "Date") as string) ?? todayISO();
      const description =
        (getField(payload, "LineItems.Description", "LineItem.Description") as string) ?? "";
      const quantity =
        Number(getField(payload, "LineItems.Quantity", "LineItem.Quantity") ?? 1) || 1;
      const unitAmount = Number(
        getField(
          payload,
          "LineItems.UnitAmount",
          "LineItem.UnitAmount",
          "LineItem.Amount",
          "Amount",
        ) ?? 0,
      );

      const contactName = (payload.contact.name ?? "").trim();
      if (!contactName) {
        return res.status(400).json({ error: "Cannot create invoice: no customer name was resolved from the record." });
      }
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        return res.status(400).json({ error: `Cannot create invoice for ${contactName}: amount is missing or invalid.` });
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

      result = { id: exec.id, deep_link: exec.deepLink, status: exec.status };
    } else if (payload.action === "create_payment") {
      const invoiceRef = String(
        getField(payload, "Invoice.InvoiceID", "Invoice", "InvoiceID", "InvoiceNumber") ?? "",
      );
      let accountCode = String(getField(payload, "Account.Code", "Account", "AccountCode") ?? "");
      const amount = Number(getField(payload, "Amount", "LineItem.Amount") ?? 0);
      const date = (getField(payload, "Date") as string) ?? todayISO();

      if (!invoiceRef) {
        return res.status(400).json({ error: "create_payment requires an invoice reference" });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: `Cannot record payment against ${invoiceRef}: amount is missing or invalid.` });
      }

      // The mapper usually emits an invoice NUMBER (e.g. "INV-0043"), not a
      // Xero GUID -- resolve it. Payments only apply to AUTHORISED invoices.
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceRef);
      let invoiceId = invoiceRef;
      if (!isGuid) {
        const found = await nodeExecutor.findInvoiceByNumber(invoiceRef);
        if (!found) {
          return res.status(400).json({ error: `No invoice found in Xero with number "${invoiceRef}"` });
        }
        if (found.status !== "AUTHORISED") {
          return res.status(400).json({
            error: `Invoice ${invoiceRef} is ${found.status} -- Xero only accepts payments against AUTHORISED invoices`,
          });
        }
        invoiceId = found.invoiceId;
      }

      // "Stripe Clearing" etc. aren't real account codes -- resolve to the
      // org's first bank account when the mapped code isn't numeric-ish.
      if (!/^\d{2,4}$/.test(accountCode)) {
        accountCode = await nodeExecutor.getDefaultPaymentAccountCode();
      }

      const exec = await nodeExecutor.createPayment({ invoiceId, accountCode, amount, date });
      result = { id: exec.id, deep_link: exec.deepLink, status: exec.status };
    } else {
      return res.status(400).json({
        error: `Unsupported action for this hackathon build: ${payload.action}`,
      });
    }

    return res.json(result);
  } catch (err) {
    console.error("[/execute] Xero write failed:", err);
    return res.status(500).json({ error: "Xero write failed", detail: String(err) });
  }
});
