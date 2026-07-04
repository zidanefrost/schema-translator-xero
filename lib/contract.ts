// The integration contract with Dev A (Mapping Engine + Xero Executor).
// Do NOT change field names without flagging it — this is a shared boundary.

// Produced by Intent Compiler (Dev B) → consumed by Mapping Engine (Dev A)
export interface Recipe {
  name: string;
  trigger: { source: string; event: string };
  target: {
    system: "xero";
    action: "create_invoice" | "create_contact" | "create_payment" | "create_bill";
  };
  intent: string;
  entity_resolution: { entity: string; match_on: string };
  guardrails: {
    invoice_status?: "DRAFT" | "AUTHORISED";
    confirm_below_confidence: number; // e.g. 0.8
  };
}

// Produced by Schema Discovery (Dev B) → consumed by Mapping Engine (Dev A)
export interface SourceField {
  name: string;
  type: string;      // inferred: "string" | "number" | "date" | ...
  semantic: string;  // what it represents, e.g. "customer name", "amount in GBP"
  sample: string;
}
export interface SourceProfile {
  // "freetext" — prose intake (Slack / WhatsApp / email-style messages):
  // fields is an empty array and the raw record is { text: string }.
  detected_format: "json" | "csv" | "webhook" | "freetext" | "unknown";
  fields: SourceField[];
}

// Produced by Mapping Engine (Dev A) → rendered by Dev B + executed by Dev A.
// Dev B only MOCKs this for now.
export interface MappedField {
  name: string;                       // Xero field name
  value: string | number | null;
  source_field: string | null;        // which source field it came from
  confidence: number;                 // 0..1
  rationale: string;                  // one sentence
}
export interface MappedPayload {
  action: string;                     // mirrors Recipe.target.action
  fields: MappedField[];
  contact: {
    match: "existing" | "new";
    contact_id?: string;
    name: string;
    confidence: number;
  };
  overall_confidence: number;
  needs_confirmation: boolean;        // true if any field < guardrail threshold
}

// A raw record from any source — arbitrary shape. For freetext sources
// this is { text: string }.
export type SourceRecord = Record<string, unknown>;

export interface MapRequest {
  recipe: Recipe;
  profile: SourceProfile;
  record: SourceRecord;
}

// Result of a real Xero write via the Executor.
export interface ExecuteResult {
  id: string;
  deep_link: string;
  status: string;
}
