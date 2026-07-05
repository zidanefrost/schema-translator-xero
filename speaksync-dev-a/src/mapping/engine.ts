import { anthropic, MODEL, safeParseJSON } from "../lib/anthropic";
import { MAPPING_SYSTEM_PROMPT } from "./prompt";
import { XERO_SCHEMA, type XeroAction } from "../xero/schema";
import type { Recipe, SourceProfile, SourceRecord, MappedPayload } from "../contract";
import type { XeroContact } from "../xero/executor";

export class MappingEngineError extends Error {
  constructor(message: string, public rawText: string) {
    super(message);
    this.name = "MappingEngineError";
  }
}

export async function mapRecord(args: {
  recipe: Recipe;
  profile: SourceProfile;
  record: SourceRecord;
  candidateContacts: XeroContact[];
}): Promise<MappedPayload> {
  const { recipe, profile, record, candidateContacts } = args;

  const action = recipe.target.action as XeroAction;
  const xeroSchema = XERO_SCHEMA[action] ?? null;

  const userContent = JSON.stringify(
    {
      today: new Date().toISOString().slice(0, 10),
      recipe,
      profile,
      record,
      candidateContacts: candidateContacts.map((c) => ({
        contact_id: c.contactId,
        name: c.name,
        email: c.emailAddress,
      })),
      xeroSchema,
    },
    null,
    2
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: MAPPING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

  try {
    const parsed = safeParseJSON<MappedPayload>(rawText);
    return parsed;
  } catch (err) {
    throw new MappingEngineError(
      "Mapping Engine returned non-parseable output",
      rawText
    );
  }
}
