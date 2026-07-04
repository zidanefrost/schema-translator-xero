import { NextResponse } from "next/server";
import { MOCK_CONTACTS } from "@/lib/mockContacts";
import type {
  MappedField,
  MappedPayload,
  Recipe,
  SourceProfile,
  SourceRecord,
} from "@/lib/contract";

// MOCK of Dev A's Mapping Engine. Deliberately simple heuristics — the real
// LLM mapper replaces this route wholesale; only the request/response shapes matter.

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'&]/g, "")
    .replace(/\b(ltd|limited|inc|incorporated|plc|llc|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveContact(rawName: string | null): MappedPayload["contact"] {
  if (!rawName) {
    return { match: "new", name: "Unknown", confidence: 0.5 };
  }
  const exact = MOCK_CONTACTS.find(
    (c) => c.name.toLowerCase() === rawName.toLowerCase(),
  );
  if (exact) {
    return { match: "existing", contact_id: exact.contact_id, name: exact.name, confidence: 0.97 };
  }
  const norm = normalizeName(rawName);
  const fuzzy = MOCK_CONTACTS.find((c) => {
    const cn = normalizeName(c.name);
    return cn === norm || cn.startsWith(norm) || norm.startsWith(cn);
  });
  if (fuzzy) {
    return { match: "existing", contact_id: fuzzy.contact_id, name: fuzzy.name, confidence: 0.86 };
  }
  return { match: "new", name: rawName, confidence: 0.75 };
}

/** Find a record value by key hints, falling back to the profile's semantic labels. */
function findValue(
  record: SourceRecord,
  profile: SourceProfile | null,
  keyHints: string[],
  semanticHints: string[],
): { key: string; value: unknown } | null {
  for (const [key, value] of Object.entries(record)) {
    const k = key.toLowerCase();
    if (keyHints.some((h) => k.includes(h))) return { key, value };
  }
  if (profile) {
    for (const f of profile.fields) {
      const sem = f.semantic.toLowerCase();
      if (semanticHints.some((h) => sem.includes(h)) && f.name in record) {
        return { key: f.name, value: record[f.name] };
      }
    }
  }
  return null;
}

function parseAmount(raw: unknown): { value: number | null; confidence: number; rationale: string } {
  if (typeof raw === "number") {
    return { value: raw, confidence: 0.97, rationale: "Amount was already a clean number." };
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    // Strip currency symbols, thousands separators, currency codes — keep digits, dot, minus.
    const cleaned = raw.replace(/[^\d.\-]/g, "");
    const num = parseFloat(cleaned);
    if (!Number.isNaN(num)) {
      const wasDirty = cleaned !== raw.trim();
      return {
        value: num,
        confidence: wasDirty ? 0.85 : 0.95,
        rationale: wasDirty
          ? `Parsed "${raw}" to ${num} by stripping currency formatting.`
          : "Numeric string parsed directly.",
      };
    }
  }
  return { value: null, confidence: 0.5, rationale: "No usable amount found in the record." };
}

function parseDate(raw: unknown): { value: string | null; confidence: number; rationale: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { value: null, confidence: 0.5, rationale: "No date value found in the record." };
  }
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { value: s, confidence: 0.97, rationale: "Date was already in ISO format." };
  }
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, a, b, year] = slash;
    const first = parseInt(a, 10);
    const second = parseInt(b, 10);
    const pad = (n: number) => String(n).padStart(2, "0");
    if (first > 12) {
      return { value: `${year}-${pad(second)}-${pad(first)}`, confidence: 0.9, rationale: `Read "${s}" as DD/MM/YYYY (day > 12 removes ambiguity).` };
    }
    if (second > 12) {
      return { value: `${year}-${pad(first)}-${pad(second)}`, confidence: 0.9, rationale: `Read "${s}" as MM/DD/YYYY (month > 12 impossible).` };
    }
    return { value: `${year}-${pad(second)}-${pad(first)}`, confidence: 0.7, rationale: `"${s}" is ambiguous — assumed UK-style DD/MM/YYYY.` };
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = parsed.toISOString().slice(0, 10);
    return { value: iso, confidence: 0.9, rationale: `Normalised "${s}" to ${iso}.` };
  }
  return { value: null, confidence: 0.5, rationale: `Could not parse "${s}" as a date.` };
}

export async function POST(req: Request) {
  let body: { recipe?: Recipe; profile?: SourceProfile; record?: SourceRecord };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON: { recipe, profile, record }" },
      { status: 400 },
    );
  }
  const { recipe, profile = null, record } = body;
  if (!record || typeof record !== "object") {
    return NextResponse.json({ error: "record is required" }, { status: 400 });
  }

  const action = recipe?.target?.action ?? "create_invoice";
  const threshold = recipe?.guardrails?.confirm_below_confidence ?? 0.8;

  // --- Contact resolution -------------------------------------------------
  const nameHit = findValue(record, profile, ["customer", "cust", "client", "payer", "company", "contact", "name"], ["customer name", "company name", "customer or company"]);
  const contact = resolveContact(
    nameHit && nameHit.value != null && String(nameHit.value).trim() !== ""
      ? String(nameHit.value)
      : null,
  );

  const fields: MappedField[] = [];

  fields.push({
    name: "Contact",
    value: contact.name,
    source_field: nameHit?.key ?? null,
    confidence: contact.confidence,
    rationale:
      contact.match === "existing"
        ? `Matched "${nameHit ? String(nameHit.value) : ""}" to existing Xero contact ${contact.name}.`
        : "No close match in Xero contacts — a new contact would be created.",
  });

  // --- Action-specific fields ---------------------------------------------
  if (action === "create_invoice" || action === "create_bill") {
    const dealHit = findValue(record, profile, ["deal_name", "deal", "description", "line_item", "product", "service"], ["deal name", "deal or project", "description", "product"]);
    const notesHit = findValue(record, profile, ["notes", "note", "memo", "comment"], ["notes", "memo", "free text"]);

    if (dealHit && String(dealHit.value).trim() !== "") {
      fields.push({
        name: "LineItem.Description",
        value: String(dealHit.value),
        source_field: dealHit.key,
        confidence: 0.95,
        rationale: `"${dealHit.key}" reads as the deal/work description.`,
      });
    } else if (notesHit && String(notesHit.value).trim() !== "") {
      fields.push({
        name: "LineItem.Description",
        value: String(notesHit.value),
        source_field: notesHit.key,
        confidence: 0.6,
        rationale: `Only "${notesHit.key}" was available — unclear if it is a description or a reference.`,
      });
    } else {
      fields.push({
        name: "LineItem.Description",
        value: null,
        source_field: null,
        confidence: 0.5,
        rationale: "No description-like field found in the source.",
      });
    }

    // Ambiguous free-text notes → Reference is the classic low-confidence case.
    if (notesHit && String(notesHit.value).trim() !== "" && dealHit) {
      const notesText = String(notesHit.value);
      const looksLikeRef = /^[A-Z]{2,}-?\d+/.test(notesText.trim());
      fields.push({
        name: "Reference",
        value: notesText,
        source_field: notesHit.key,
        confidence: looksLikeRef ? 0.92 : 0.6,
        rationale: looksLikeRef
          ? `"${notesText}" matches a reference-code pattern.`
          : `"${notesHit.key}" is free text — could be a reference or a description.`,
      });
    }

    const amountHit = findValue(record, profile, ["amount", "amt", "value", "total", "price"], ["amount", "value in", "price"]);
    const amt = parseAmount(amountHit?.value);
    fields.push({
      name: "LineItem.Amount",
      value: amt.value,
      source_field: amountHit?.key ?? null,
      confidence: amt.confidence,
      rationale: amt.rationale,
    });

    const dateHit = findValue(record, profile, ["close_date", "date", "dt_", "closed"], ["close date", "date"]);
    const date = parseDate(dateHit?.value);
    fields.push({
      name: "Date",
      value: date.value,
      source_field: dateHit?.key ?? null,
      confidence: date.confidence,
      rationale: date.rationale,
    });

    fields.push({
      name: "Status",
      value: recipe?.guardrails?.invoice_status ?? "DRAFT",
      source_field: null,
      confidence: 1,
      rationale: "Status fixed by the recipe guardrails.",
    });

    // Email: only scored when the source has an email-shaped field at all.
    const emailHit = findValue(record, profile, ["email", "e-mail", "mail"], ["email"]);
    if (emailHit) {
      const emailVal = String(emailHit.value ?? "").trim();
      fields.push({
        name: "Contact.Email",
        value: emailVal || null,
        source_field: emailHit.key,
        confidence: emailVal ? 0.95 : 0.6,
        rationale: emailVal
          ? "Email present and well-formed in the source."
          : "Source has an email field but this record's value is missing.",
      });
    }
  } else if (action === "create_payment") {
    const invoiceHit = findValue(record, profile, ["invoice", "inv_", "reference", "ref"], ["invoice"]);
    const invoiceRef = invoiceHit ? String(invoiceHit.value ?? "").trim() : "";
    fields.push({
      name: "Invoice",
      value: invoiceRef || null,
      source_field: invoiceHit?.key ?? null,
      confidence: invoiceRef ? 0.9 : 0.55,
      rationale: invoiceRef
        ? `"${invoiceHit!.key}" identifies the invoice to pay.`
        : "No invoice reference found — matching would need the contact + amount.",
    });

    const amountHit = findValue(record, profile, ["amount", "amt", "total", "paid"], ["amount", "payment"]);
    const amt = parseAmount(amountHit?.value);
    fields.push({
      name: "Amount",
      value: amt.value,
      source_field: amountHit?.key ?? null,
      confidence: amt.confidence,
      rationale: amt.rationale,
    });

    const dateHit = findValue(record, profile, ["date", "paid_at", "created", "timestamp"], ["date", "time"]);
    const date = parseDate(dateHit?.value);
    fields.push({
      name: "Date",
      value: date.value,
      source_field: dateHit?.key ?? null,
      confidence: date.confidence,
      rationale: date.rationale,
    });

    fields.push({
      name: "Account",
      value: "Stripe Clearing",
      source_field: null,
      confidence: 0.85,
      rationale: "Default clearing account for card payments — configurable later.",
    });
  } else {
    // create_contact
    const emailHit = findValue(record, profile, ["email", "mail"], ["email"]);
    fields.push({
      name: "Name",
      value: contact.name,
      source_field: nameHit?.key ?? null,
      confidence: contact.confidence,
      rationale: "Contact name taken from the customer field.",
    });
    fields.push({
      name: "Email",
      value: emailHit ? String(emailHit.value ?? "") || null : null,
      source_field: emailHit?.key ?? null,
      confidence: emailHit && String(emailHit.value ?? "").trim() ? 0.95 : 0.6,
      rationale: emailHit ? "Email taken from the source." : "No email found in the source.",
    });
  }

  const needs_confirmation =
    fields.some((f) => f.confidence < threshold) || contact.confidence < threshold;
  const overall_confidence =
    Math.round(
      (fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length) * 100,
    ) / 100;

  const payload: MappedPayload = {
    action,
    fields,
    contact,
    overall_confidence,
    needs_confirmation,
  };

  return NextResponse.json(payload);
}
