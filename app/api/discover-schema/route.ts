import { NextResponse } from "next/server";
import { anthropic, MODEL, safeParseJSON } from "@/lib/anthropic";
import type { SourceProfile } from "@/lib/contract";

const SYSTEM_PROMPT = `You are given a raw payload from an UNKNOWN business system — it may be JSON, a CSV (with a header row), or a webhook body. Infer a Source Profile. Set detected_format to one of "json", "csv", "webhook", "unknown". For every field, give its name, an inferred type (e.g. "string", "number", "date"), a short semantic label describing what it represents in plain English (e.g. "customer name", "amount in GBP", "deal close date", "pipeline stage — likely unused"), and a sample value taken from the data (as a string). Do not assume any specific source product. If it's CSV, treat the header row as field names and infer types from the values.

Respond with ONLY the JSON object, no prose, no markdown fences, in exactly this shape:
{"detected_format": "json" | "csv" | "webhook" | "unknown", "fields": [{"name": string, "type": string, "semantic": string, "sample": string}]}`;

// Keep prompts bounded even if someone pastes a huge file.
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
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: payload.slice(0, MAX_PAYLOAD_CHARS) }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    let profile: SourceProfile;
    try {
      profile = safeParseJSON<SourceProfile>(text);
    } catch {
      return NextResponse.json(
        { error: "Model did not return parseable JSON", raw: text },
        { status: 422 },
      );
    }

    if (!profile.detected_format || !Array.isArray(profile.fields)) {
      return NextResponse.json(
        { error: "Model JSON did not match the SourceProfile shape", raw: text },
        { status: 422 },
      );
    }

    return NextResponse.json(profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Schema discovery failed: ${message}` }, { status: 500 });
  }
}
