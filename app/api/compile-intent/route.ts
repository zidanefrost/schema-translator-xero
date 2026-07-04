import { NextResponse } from "next/server";
import { anthropic, MODEL, safeParseJSON } from "@/lib/anthropic";
import type { Recipe } from "@/lib/contract";

const SYSTEM_PROMPT = `You convert a plain-English integration request into a JSON Integration Recipe for syncing data into Xero. Identify: the trigger (source system + event), the Xero target action — one of create_invoice, create_contact, create_payment, create_bill — an entity_resolution rule (how to match or create the customer/supplier contact), guardrails (invoice_status "DRAFT" unless the user says otherwise; confirm_below_confidence default 0.8), and a precise one-paragraph restatement of the user's intent. Do NOT produce any field mapping.

Respond with ONLY the JSON object, no prose, no markdown fences, in exactly this shape:
{
  "name": string,
  "trigger": { "source": string, "event": string },
  "target": { "system": "xero", "action": "create_invoice" | "create_contact" | "create_payment" | "create_bill" },
  "intent": string,
  "entity_resolution": { "entity": string, "match_on": string },
  "guardrails": { "invoice_status": "DRAFT" | "AUTHORISED", "confirm_below_confidence": number }
}`;

const VALID_ACTIONS = ["create_invoice", "create_contact", "create_payment", "create_bill"];

export async function POST(req: Request) {
  let instruction: unknown;
  try {
    ({ instruction } = await req.json());
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON: { instruction: string }" },
      { status: 400 },
    );
  }
  if (typeof instruction !== "string" || instruction.trim() === "") {
    return NextResponse.json({ error: "instruction must be a non-empty string" }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: instruction }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    let recipe: Recipe;
    try {
      recipe = safeParseJSON<Recipe>(text);
    } catch {
      return NextResponse.json(
        { error: "Model did not return parseable JSON", raw: text },
        { status: 422 },
      );
    }

    if (
      !recipe.target ||
      !VALID_ACTIONS.includes(recipe.target.action) ||
      !recipe.trigger ||
      !recipe.guardrails
    ) {
      return NextResponse.json(
        { error: "Model JSON did not match the Recipe shape", raw: text },
        { status: 422 },
      );
    }

    return NextResponse.json(recipe);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Intent compilation failed: ${message}` }, { status: 500 });
  }
}
