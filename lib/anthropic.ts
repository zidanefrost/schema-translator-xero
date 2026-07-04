import Anthropic from "@anthropic-ai/sdk";

// Model is swappable via env without touching code.
export const MODEL = process.env.SPEAKSYNC_MODEL ?? "claude-sonnet-5";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Parse LLM output that should be pure JSON but may arrive wrapped in
 * ```json fences or with stray text around the object.
 * Throws if no parseable JSON is found — callers turn that into a 422.
 */
export function safeParseJSON<T = unknown>(text: string): T {
  let cleaned = text.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the first {...} or [...] block in the text.
    const objMatch = cleaned.match(/[{[][\s\S]*[}\]]/);
    if (objMatch) {
      return JSON.parse(objMatch[0]) as T;
    }
    throw new SyntaxError("No parseable JSON found in model output");
  }
}
