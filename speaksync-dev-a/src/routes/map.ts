import { Router } from "express";
import { mapRecord, MappingEngineError } from "../mapping/engine";
import { nodeExecutor } from "../xero/executor.node";
import type { MapRequest } from "../contract";
import type { XeroContact } from "../xero/executor";

export const mapRouter = Router();

// POST /map
// Body: { recipe, profile, record }  ->  MappedPayload
//
// This is the ONLY place Xero-relevant reasoning happens for both the
// CSV demo (Dev B) and the Slack demo (Make). It:
//   1. Pulls candidate contacts from Xero so the LLM can resolve entities
//      against the REAL Demo Company, not a guess.
//   2. Runs the Mapping Engine (Anthropic) to extract + score fields.
//   3. Returns a MappedPayload — Make/Dev B decide whether to confirm.
mapRouter.post("/", async (req, res) => {
  const body = req.body as Partial<MapRequest>;

  if (!body?.recipe || !body?.profile || !body?.record) {
    return res.status(400).json({
      error: "Request must be { recipe, profile, record }",
    });
  }

  try {
    // Fetch existing contacts for entity resolution. If Xero is briefly
    // unavailable we still let the LLM run with an empty candidate list
    // (it will fall back to match "new"), rather than failing the map.
    let candidateContacts: XeroContact[];
    try {
      candidateContacts = await nodeExecutor.listContacts();
    } catch (contactErr) {
      console.warn(
        "[/map] Could not list Xero contacts — proceeding with no candidates:",
        String(contactErr)
      );
      candidateContacts = [];
    }

    const mapped = await mapRecord({
      recipe: body.recipe,
      profile: body.profile,
      record: body.record,
      candidateContacts,
    });

    return res.json(mapped);
  } catch (err) {
    if (err instanceof MappingEngineError) {
      // 422: the model ran but produced something we couldn't parse.
      return res.status(422).json({
        error: err.message,
        raw: err.rawText,
      });
    }
    console.error("[/map] Mapping failed:", err);
    return res.status(500).json({ error: "Mapping failed", detail: String(err) });
  }
});
