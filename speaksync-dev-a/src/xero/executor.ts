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
  dueDate?: string; // required by Xero for AUTHORISED invoices
  invoiceNumber?: string; // e.g. INV-0042 (used by the payment-demo seed)
  reference?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    accountCode?: string; // required by Xero for AUTHORISED invoices
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

/**
 * All Xero writes happen through this interface — kept deterministic
 * (no LLM calls) so the human-confirm gate upstream is meaningful and
 * results are predictable. Two implementations may sit behind this:
 * xero-node (primary, used for the hackathon) or the Xero MCP server
 * (stretch, only if there's time to spare after Phase 2).
 */
export interface Executor {
  listContacts(): Promise<XeroContact[]>;
  findContact(nameOrEmail: string): Promise<XeroContact | null>;
  createContact(name: string, email?: string): Promise<XeroContact>;
  createInvoice(input: CreateInvoiceInput): Promise<ExecResult>;
  createPayment(input: CreatePaymentInput): Promise<ExecResult>;
  findInvoiceByNumber(
    invoiceNumber: string,
  ): Promise<{ invoiceId: string; status: string; amountDue: number } | null>;
  findInvoiceByReference(
    contactId: string,
    reference: string,
  ): Promise<{ id: string; deepLink: string; status: string } | null>;
  getDefaultPaymentAccountCode(): Promise<string>;
}
