// A concise reference of the Xero fields the Mapping Engine can target,
// per Recipe action. This is NOT the full Xero API schema — just enough
// for the LLM to produce a valid, minimal payload.

export const XERO_SCHEMA = {
  create_invoice: {
    required: ["Contact.Name", "LineItems", "Type", "Status"],
    fields: {
      "Contact.Name": { type: "string", note: "Resolved or new contact name" },
      "LineItems[].Description": { type: "string" },
      "LineItems[].Quantity": { type: "number", default: 1 },
      "LineItems[].UnitAmount": { type: "number" },
      Date: { type: "string", format: "YYYY-MM-DD" },
      Type: { type: "enum", values: ["ACCREC"] },
      Status: { type: "enum", values: ["DRAFT", "AUTHORISED"] },
    },
  },
  create_payment: {
    required: ["Invoice.InvoiceID", "Account.Code", "Amount", "Date"],
    fields: {
      "Invoice.InvoiceID": { type: "string" },
      "Account.Code": { type: "string" },
      Amount: { type: "number" },
      Date: { type: "string", format: "YYYY-MM-DD" },
    },
  },
  create_contact: {
    required: ["Name"],
    fields: {
      Name: { type: "string" },
      EmailAddress: { type: "string", optional: true },
    },
  },
  create_bill: {
    required: ["Contact.Name", "LineItems", "Type", "Status"],
    fields: {
      "Contact.Name": { type: "string" },
      "LineItems[].Description": { type: "string" },
      "LineItems[].Quantity": { type: "number", default: 1 },
      "LineItems[].UnitAmount": { type: "number" },
      Date: { type: "string", format: "YYYY-MM-DD" },
      Type: { type: "enum", values: ["ACCPAY"] },
      Status: { type: "enum", values: ["DRAFT", "AUTHORISED"] },
    },
  },
} as const;

export type XeroAction = keyof typeof XERO_SCHEMA;
