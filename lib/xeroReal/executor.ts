import { getXero } from "./auth";

// Deterministic Xero Executor (no LLM calls) — ported from
// speaksync-dev-a/src/xero/executor{,.node}.ts so the Next app can run the
// real pipeline in-process (single Vercel deployment). Keep the two copies
// in sync if either changes.

export interface XeroContact {
  contactId: string;
  name: string;
  emailAddress?: string;
}

export interface CreateInvoiceInput {
  contactId?: string; // if resolved to an existing contact
  contactName: string; // used if creating a new contact
  status: "DRAFT" | "AUTHORISED";
  date: string; // YYYY-MM-DD
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
  }>;
}

export interface CreatePaymentInput {
  invoiceId: string;
  accountCode: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

export interface ExecResult {
  id: string;
  deepLink: string;
  status: string;
}

export function hasXeroCreds(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

function deepLinkForInvoice(invoiceId: string): string {
  return `https://go.xero.com/app/invoicing/view/${invoiceId}`;
}

export const nodeExecutor = {
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

    const exact = all.find(
      (c) =>
        c.name.trim().toLowerCase() === needle ||
        c.emailAddress?.trim().toLowerCase() === needle,
    );
    if (exact) return exact;

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

  async createInvoice(input: CreateInvoiceInput): Promise<ExecResult> {
    const { client, tenantId } = await getXero();

    let contactId = input.contactId;
    if (!contactId) {
      const contact = await this.createContact(input.contactName);
      contactId = contact.contactId;
    }

    const res = await client.accountingApi.createInvoices(tenantId, {
      invoices: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: "ACCREC" as any,
          contact: { contactID: contactId },
          date: input.date,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: input.status as any,
          lineItems: input.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitAmount: li.unitAmount,
          })),
        },
      ],
    });

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

  async createPayment(input: CreatePaymentInput): Promise<ExecResult> {
    const { client, tenantId } = await getXero();

    const res = await client.accountingApi.createPayments(tenantId, {
      payments: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          invoice: { invoiceID: input.invoiceId } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          account: { code: input.accountCode } as any,
          amount: input.amount,
          date: input.date,
        },
      ],
    });

    const payment = res.body.payments?.[0];
    if (!payment?.paymentID) {
      throw new Error("createPayment: Xero did not return a paymentID");
    }

    return {
      id: payment.paymentID,
      deepLink: deepLinkForInvoice(input.invoiceId), // payments link back to the invoice
      status: String(payment.status ?? "AUTHORISED"),
    };
  },
};
