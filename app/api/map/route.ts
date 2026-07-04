import { NextResponse } from "next/server";
import { mapRecord } from "@/lib/mockMapper";
import { mapRecordReal, MappingEngineError } from "@/lib/xeroReal/engine";
import { nodeExecutor, hasXeroCreds, type XeroContact } from "@/lib/xeroReal/executor";
import type { Recipe, SourceProfile, SourceRecord } from "@/lib/contract";

// Mapping Engine endpoint. Three modes, in priority order:
//
// 1. DEV_A_BASE_URL set        -> proxy to Dev A's standalone service.
// 2. XERO_CLIENT_ID/SECRET set -> run the REAL engine in-process
//    (Claude mapping + entity resolution against live Xero contacts).
// 3. Neither                   -> local mock mapper (offline UI work and
//    the static GitHub Pages build).
//
// Request { recipe, profile, record } and MappedPayload response are
// identical in all three modes.

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
  const { recipe, profile, record } = body;
  if (!record || typeof record !== "object") {
    return NextResponse.json({ error: "record is required" }, { status: 400 });
  }

  // Mode 1: external Dev A service.
  const baseUrl = process.env.DEV_A_BASE_URL;
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, profile, record }),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      return NextResponse.json(
        { error: "Could not reach Dev A Mapping Engine", detail: String(err) },
        { status: 502 },
      );
    }
  }

  // Mode 2: in-process real engine.
  if (hasXeroCreds() && recipe && profile) {
    try {
      let candidateContacts: XeroContact[];
      try {
        candidateContacts = await nodeExecutor.listContacts();
      } catch (contactErr) {
        console.warn("[/api/map] Could not list Xero contacts:", String(contactErr));
        candidateContacts = [];
      }
      const mapped = await mapRecordReal({ recipe, profile, record, candidateContacts });
      return NextResponse.json(mapped);
    } catch (err) {
      if (err instanceof MappingEngineError) {
        return NextResponse.json({ error: err.message, raw: err.rawText }, { status: 422 });
      }
      return NextResponse.json(
        { error: "Mapping failed", detail: String(err) },
        { status: 500 },
      );
    }
  }

  // Mode 3: local mock.
  return NextResponse.json(mapRecord(recipe, profile, record));
}
