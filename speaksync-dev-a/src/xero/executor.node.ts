import { getXero } from "./auth";
import type {
  Executor,
  XeroContact,
  CreateInvoiceInput,
  CreatePaymentInput,
  ExecResult,
} from "./executor";

// NOTE: method names below (getContacts, createContacts, createInvoices,
// createPayments) match xero-node's AccountingApi as of recent SDK
// versions. Verify field casing (e.g. UnitAmount vs unitAmount) against
// the installed xero-node version's generated types if TypeScript
// complains — the SDK has changed casing conventions across majors.

// TODO verify: confirm the exact deep-link URL format in the current
// Xero developer docs. This is a reasonable placeholder, not guaranteed
// stable across Xero UI versions.
function deepLinkForInvoice(invoiceId: string): string {
  return `https://go.xero.com/app/invoicing/view/${invoiceId}`;
}

/** Pull the human-readable message(s) out of a Xero API error response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function xeroErrorMessage(err: any): string {
  const body = err?.response?.body;
  const messages: string[] = [];
  for (const el of body?.Elements ?? []) {
    for (const ve of el?.ValidationErrors ?? []) {
      if (ve?.Message) messages.push(String(ve.Message));
    }
  }
  for (const ve of body?.ValidationErrors ?? []) {
    if (ve?.Message) messages.push(String(ve.Message));
  }
  if (messages.length > 0) return messages.join("; ");
  if (body?.Message) return String(body.Message);
  return err instanceof Error ? err.message : String(err);
}

export const nodeExecutor: Executor = {
  async listContacts(): Promise<XeroContact[]> {
    const { client, tenantId } = await getXero();
    const res = await client.accountingApi.getContacts(tenantId);
    const contacts = res.body.contacts ?? [];
    return contacts.map((c) => ({
      contactId: c.contactID!,
      name: c.name ?? "",
      emailAddress: c.emailAddress,
    }));
  },

  async findContact(nameOrEmail: string): Promise<XeroContact | null> {
    const all = await this.listContacts();
    const needle = nameOrEmail.trim().toLowerCase();

    // Exact match first (name or email).
    const exact = all.find(
      (c) =>
        c.name.trim().toLowerCase() === needle ||
        c.emailAddress?.trim().toLowerCase() === needle
    );
    if (exact) return exact;

    // Loose match: normalise common suffixes (Ltd/Limited/Inc) and strip
    // punctuation, so "acme ltd" matches "Acme Limited". This is a cheap
    // Tier-1-style fuzzy check, not a replacement for the LLM's judgement
    // — the Mapping Engine still decides overall confidence.
    const normalise = (s: string) =>
      s
        .toLowerCase()
        .replace(/[.,]/g, "")
        .replace(/\b(ltd|limited|inc|incorporated|llc)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const normalisedNeedle = normalise(needle);
    const loose = all.find((c) => normalise(c.name) === normalisedNeedle);
    return loose ?? null;
  },

  async createContact(name: string, email?: string): Promise<XeroContact> {
    // Defensive re-check immediately before creating, to avoid a duplicate
    // if two records for the same new customer arrive in the same run.
    const existing = await this.findContact(name);
    if (existing) return existing;

    const { client, tenantId } = await getXero();
    const res = await client.accountingApi.createContacts(tenantId, {
      contacts: [{ name, emailAddress: email }],
    });
    const created = res.body.contacts?.[0];
    if (!created?.contactID) {
      throw new Error("createContact: Xero did not return a contactID");
    }
    return { contactId: created.contactID, name: created.name ?? name, emailAddress: email };
  },


  /** Existing (non-deleted) invoice for this contact with this reference, or null. */
  async findInvoiceByReference(
    contactId: string,
    reference: string,
  ): Promise<{ id: string; deepLink: string; status: string } | null> {
    try {
      const { client, tenantId } = await getXero();
      const where = `Contact.ContactID==guid("${contactId}") AND Reference=="${reference.replace(/"/g, "")}" AND Status!="DELETED"`;
      const res = await client.accountingApi.getInvoices(tenantId, undefined, where);
      const inv = res.body.invoices?.[0];
      if (!inv?.invoiceID) return null;
      return {
        id: inv.invoiceID,
        deepLink: deepLinkForInvoice(inv.invoiceID),
        status: String(inv.status ?? ""),
      };
    } catch {
      return null; // lookup failure must never block the write
    }
  },

  async createInvoice(input: CreateInvoiceInput): Promise<ExecResult> {
    const { client, tenantId } = await getXero();

    let contactId = input.contactId;
    if (!contactId) {
      const contact = await this.createContact(input.contactName);
      contactId = contact.contactId;
    }

    // Opt-in idempotency: an explicit reference identifies the SAME source
    // event, so a rerun returns the existing invoice instead of duplicating.
    if (input.reference) {
      const existing = await this.findInvoiceByReference(contactId, input.reference);
      if (existing) return existing;
    }

    let res;
    try {
      res = await client.accountingApi.createInvoices(tenantId, {
      invoices: [
        {
          type: "ACCREC" as any,
          contact: { contactID: contactId },
          date: input.date,
          dueDate: input.dueDate,
          status: input.status as any,
          invoiceNumber: input.invoiceNumber,
          reference: input.reference,
          lineItems: input.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitAmount: li.unitAmount,
            accountCode: li.accountCode,
          })),
        },
      ],
      });
    } catch (err) {
      throw new Error(`Xero rejected the invoice: ${xeroErrorMessage(err)}`);
    }

    const invoice = res.body.invoices?.[0];
    if (!invoice?.invoiceID) {
      throw new Error("createInvoice: Xero did not return an invoiceID");
    }

    return {
      id: invoice.invoiceID,
      deepLink: deepLinkForInvoice(invoice.invoiceID),
      status: String(invoice.status ?? input.status),
    };
  },

  async findInvoiceByNumber(
    invoiceNumber: string,
  ): Promise<{ invoiceId: string; status: string; amountDue: number } | null> {
    const { client, tenantId } = await getXero();
    const res = await client.accountingApi.getInvoices(
      tenantId,
      undefined,
      undefined,
      undefined,
      undefined,
      [invoiceNumber],
    );
    const inv = res.body.invoices?.[0];
    if (!inv?.invoiceID) return null;
    return {
      invoiceId: inv.invoiceID,
      status: String(inv.status ?? ""),
      amountDue: Number(inv.amountDue ?? 0),
    };
  },

  async getDefaultPaymentAccountCode(): Promise<string> {
    const { client, tenantId } = await getXero();
    try {
      const res = await client.accountingApi.getAccounts(tenantId, undefined, 'Type=="BANK"');
      const code = res.body.accounts?.find((a) => a.code)?.code;
      if (code) return code;
    } catch {
      // Custom Connection may lack accounting.settings.read - fall through.
    }
    // 090 = Business Bank Account in the Xero Demo Company chart.
    return process.env.XERO_PAYMENT_ACCOUNT_CODE ?? "090";
  },

  async createPayment(input: CreatePaymentInput): Promise<ExecResult> {
    const { client, tenantId } = await getXero();

    let res;
    try {
      res = await client.accountingApi.createPayments(tenantId, {
      payments: [
        {
          invoice: { invoiceID: input.invoiceId } as any,
          account: { code: input.accountCode } as any,
          amount: input.amount,
          date: input.date,
        },
      ],
      });
    } catch (err) {
      throw new Error(`Xero rejected the payment: ${xeroErrorMessage(err)}`);
    }

    const payment = res.body.payments?.[0];
    if (!payment?.paymentID) {
      throw new Error("createPayment: Xero did not return a paymentID");
    }

    return {
      id: payment.paymentID,
      deepLink: deepLinkForInvoice(input.invoiceId), // payments don't have their own view page; link back to the invoice
      status: String(payment.status ?? "AUTHORISED"),
    };
  },
};
