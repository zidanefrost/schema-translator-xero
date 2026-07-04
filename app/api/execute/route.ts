import { NextResponse } from "next/server";
import type { MappedPayload } from "@/lib/contract";

// Execute endpoint — writes a mapped record to Xero via Dev A's REAL
// Xero Executor. Call this when a row auto-syncs (needs_confirmation false)
// or after the user accepts/edits a ConfirmCard.
//
// Body:  MappedPayload  (the possibly human-edited object)
// Reply: { id, deep_link, status }  from Xero
//
// Requires DEV_A_BASE_URL. There is no mock fallback here: "executing"
// only means something when it hits the real Xero org.

export async function POST(req: Request) {
  const baseUrl = process.env.DEV_A_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: "DEV_A_BASE_URL is not set — cannot execute to Xero." },
      { status: 503 },
    );
  }

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
