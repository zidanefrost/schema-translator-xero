import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MappedPayload } from "../src/contract";

// Phase-2 smoke test for the Mapping Engine (/map).
//
// Requires the server to be running (npm start) AND ANTHROPIC_API_KEY set.
// Sends a free-text, Slack/email-style message through /map and prints the
// MappedPayload, so you can confirm the LLM step works end to end without
// hand-rolling curl.
//
// Usage:
//   npm run smoke:map                     # uses a built-in sample message
//   npm run smoke:map -- "your message"   # try your own free text

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const recipe = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/recipe.slack.json"), "utf8")
);
const profile = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/profile.freetext.json"), "utf8")
);

const text =
  process.argv.slice(2).join(" ").trim() ||
  "invoice Riverside Cafe for a kitchen refit deposit, 500 quid, due end of month";

async function main() {
  console.log(`POST ${BASE_URL}/map`);
  console.log(`record.text: "${text}"\n`);

  const res = await fetch(`${BASE_URL}/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe, profile, record: { text } }),
  });

  const raw = await res.text();

  if (!res.ok) {
    console.error(`\n❌ /map returned ${res.status}:\n${raw}`);
    console.error(
      "\nCommon causes: ANTHROPIC_API_KEY missing/invalid, or SPEAKSYNC_MODEL " +
        "is not a model your account can access."
    );
    process.exit(1);
  }

  let payload: MappedPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error("❌ Response was not valid JSON:\n", raw);
    process.exit(1);
  }

  console.log("MappedPayload:\n");
  console.log(JSON.stringify(payload, null, 2));

  const threshold = recipe?.guardrails?.confirm_below_confidence ?? 0.8;
  const lowFields = (payload.fields ?? []).filter((f) => f.confidence < threshold);

  console.log("\n--- summary ---");
  console.log(`action:              ${payload.action}`);
  console.log(`contact:             ${payload.contact?.name} (${payload.contact?.match})`);
  console.log(`overall_confidence:  ${payload.overall_confidence}`);
  console.log(`needs_confirmation:  ${payload.needs_confirmation}`);
  console.log(
    `fields below ${threshold}:   ${lowFields.length ? lowFields.map((f) => f.name).join(", ") : "none"}`
  );
  console.log(
    "\n✅ /map is working. Feed this MappedPayload to /execute to create the draft invoice."
  );
}

main().catch((err) => {
  console.error("\n❌ smoke:map failed:\n", err);
  console.error(
    `\nIs the server running? Start it with 'npm start' (expected at ${BASE_URL}).`
  );
  process.exit(1);
});
