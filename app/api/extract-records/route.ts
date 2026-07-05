import { NextResponse } from "next/server";
import { anthropic, MODEL, safeParseJSON } from "@/lib/anthropic";
import type { SourceRecord } from "@/lib/contract";

// Extraction stage: unstructured business communication (Slack threads, emails,
// chat transcripts) → flat structured records the rest of the pipeline can map.

const SYSTEM_PROMPT = `Today's date is ${new Date().toISOString().slice(0, 10)} — use it to resolve relative or year-less dates.

You are given unstructured business communication — Slack messages, emails, or chat transcripts. Extract every distinct business transaction or deal mentioned into a flat JSON record.

Rules:
- One record per distinct transaction/deal/payment, in the order mentioned.
- Use clear snake_case field names such as: customer, email, amount, currency, close_date, deal_name, notes. Include a field only when the text supports it.
- Keep values as they appear in the text (do not normalise amounts or dates — downstream mapping handles that). Amounts like "£3,200" or "450 quid" stay as written.
- Put uncertainty or asides (e.g. "i think close date was july 1st?") into a notes field rather than inventing precision.
- Ignore chatter that contains no business transaction.

Respond with ONLY the JSON object, no prose, no markdown fences, in exactly this shape:
{"records": [{...}, {...}]}`;

const MAX_PAYLOAD_CHARS = 12_000;

export async function POST(req: Request) {
  let payload: unknown;
  try {
    ({ payload } = await req.json());
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { payload: string }" }, { status: 400 });
  }
  if (typeof payload !== "string" || payload.trim() === "") {
    return NextResponse.json({ error: "payload must be a non-empty string" }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: payload.slice(0, MAX_PAYLOAD_CHARS) }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    let parsed: { records: SourceRecord[] };
    try {
      parsed = safeParseJSON<{ records: SourceRecord[] }>(text);
    } catch {
      return NextResponse.json(
        { error: "Model did not return parseable JSON", raw: text },
        { status: 422 },
      );
    }

    if (!Array.isArray(parsed.records) || parsed.records.length === 0) {
      return NextResponse.json(
        { error: "No records could be extracted from the text", raw: text },
        { status: 422 },
      );
    }

    return NextResponse.json({ records: parsed.records });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Record extraction failed: ${message}` }, { status: 500 });
  }
}
