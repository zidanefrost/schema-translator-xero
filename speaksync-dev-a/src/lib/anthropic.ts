import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  // Fail loudly at boot rather than at first request.
  console.warn(
    "[anthropic] ANTHROPIC_API_KEY is not set — Mapping Engine calls will fail."
  );
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = process.env.SPEAKSYNC_MODEL || "claude-3-5-sonnet-latest";

/**
 * Defensively parse JSON out of an LLM response: strips markdown code
 * fences if present, and falls back to extracting the first {...} block
 * if the model added any stray prose. Throws if nothing parseable is found
 * — callers should catch this and return a 422 with the raw text rather
 * than crashing.
 */
export function safeParseJSON<T = unknown>(raw: string): T {
  let text = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // Fallback: find the first balanced-looking {...} block.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = text.slice(start, end + 1);
      return JSON.parse(candidate) as T;
    }
    throw new Error("safeParseJSON: no valid JSON found in model output");
  }
}
