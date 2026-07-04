// ---------------------------------------------------------------------------
// The integration contract. This file must stay byte-for-byte identical to
// Dev B's copy. Dev A (this service) CONSUMES Recipe + SourceProfile + raw
// records, and PRODUCES MappedPayload.
// ---------------------------------------------------------------------------

// Produced by the Intent Compiler (Dev B) -> consumed by the Mapping Engine
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

// Produced by Schema Discovery (Dev B) -> consumed by the Mapping Engine
export interface SourceField {
  name: string;
  type: string;
  semantic: string;
  sample: string;
}

export interface SourceProfile {
  // "freetext" added for prose intake (Slack / WhatsApp / email-style
  // messages via Make) — when detected_format is "freetext", `fields` is
  // an empty array and the raw record is `{ text: string }` instead of a
  // structured object.
  detected_format: "json" | "csv" | "webhook" | "freetext" | "unknown";
  fields: SourceField[];
}

// Produced by the Mapping Engine (Dev A) -> rendered by Dev B, executed by Dev A
export interface MappedField {
  name: string; // Xero field name
  value: string | number | null;
  source_field: string | null;
  confidence: number; // 0..1
  rationale: string;
}

export interface MappedPayload {
  action: string; // mirrors Recipe.target.action
  fields: MappedField[];
  contact: {
    match: "existing" | "new";
    contact_id?: string;
    name: string;
    confidence: number;
  };
  overall_confidence: number;
  needs_confirmation: boolean; // true if any field < guardrail threshold
}

// A raw record from any source — arbitrary shape. For freetext sources
// this is `{ text: string }`.
export type SourceRecord = Record<string, unknown>;

export interface MapRequest {
  recipe: Recipe;
  profile: SourceProfile;
  record: SourceRecord;
}

export interface ExecuteResult {
  id: string;
  deep_link: string;
  status: string;
}
