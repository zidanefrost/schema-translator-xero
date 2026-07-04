import { NextResponse } from "next/server";
import { executeMappedPayload } from "@/lib/xeroReal/executeMapped";
import { hasXeroCreds } from "@/lib/xeroReal/executor";
import type { MappedPayload } from "@/lib/contract";

// Execute endpoint — writes a mapped record to Xero. Three modes:
//
// 1. DEV_A_BASE_URL set        -> proxy to Dev A's standalone service.
// 2. XERO_CLIENT_ID/SECRET set -> execute in-process via xero-node.
// 3. Neither                   -> 503; the UI degrades to a clearly
//    labelled simulated sync (no fake Xero links).
//
// Body:  MappedPayload  (the possibly human-edited object)
// Reply: { id, deep_link, status }

export async function POST(req: Request) {
  let payload: MappedPayload;
  try {
    payload = (await req.json()) as MappedPayload;
  } catch {
    return NextResponse.json(
      { error: "Body must be a MappedPayload JSON object" },
      { status: 400 },
    );
  }

  if (!payload?.action || !Array.isArray(payload.fields) || !payload.contact) {
    return NextResponse.json(
      { error: "Body must be a MappedPayload — { action, fields, contact, ... }" },
      { status: 400 },
    );
  }

  // Mode 1: external Dev A service.
  const baseUrl = process.env.DEV_A_BASE_URL;
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      return NextResponse.json(
        { error: "Could not reach Dev A Xero Executor", detail: String(err) },
        { status: 502 },
      );
    }
  }

  // Mode 2: in-process real executor.
  if (hasXeroCreds()) {
    try {
      const result = await executeMappedPayload(payload);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[/api/execute] Xero write failed:", err);
      return NextResponse.json(
        { error: "Xero write failed", detail: String(err) },
        { status: 500 },
      );
    }
  }

  // Mode 3: no executor configured.
  return NextResponse.json(
    { error: "No Xero executor configured (set DEV_A_BASE_URL or XERO_CLIENT_ID/SECRET)." },
    { status: 503 },
  );
}
