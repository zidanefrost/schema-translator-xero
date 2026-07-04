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

      const exec = await nodeExecutor.createInvoice({
        contactId: payload.contact.match === "existing" ? payload.contact.contact_id : undefined,
        contactName: payload.contact.name,
        status,
        date,
        lineItems: [{ description, quantity, unitAmount }],
      });

      result = { id: exec.id, deep_link: exec.deepLink, status: exec.status };
    } else if (payload.action === "create_payment") {
      const invoiceId = String(getField(payload, "Invoice.InvoiceID", "Invoice", "InvoiceID") ?? "");
      const accountCode = String(getField(payload, "Account.Code", "Account", "AccountCode") ?? "");
      const amount = Number(getField(payload, "Amount", "LineItem.Amount") ?? 0);
      const date = (getField(payload, "Date") as string) ?? todayISO();

      if (!invoiceId) {
        return res.status(400).json({ error: "create_payment requires Invoice.InvoiceID" });
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
