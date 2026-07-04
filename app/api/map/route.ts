import { NextResponse } from "next/server";
import { mapRecord } from "@/lib/mockMapper";
import type { Recipe, SourceProfile, SourceRecord } from "@/lib/contract";

// Mapping Engine endpoint.
//
// If DEV_A_BASE_URL is set, this proxies to Dev A's REAL Mapping Engine
// (Claude extraction + real Xero contact resolution). Request and response
// shapes are identical to the mock, so nothing in the UI changes.
//
// If DEV_A_BASE_URL is NOT set, it falls back to the local mock mapper —
// handy for offline UI work and the static GitHub Pages build.

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

  const baseUrl = process.env.DEV_A_BASE_URL;
  if (!baseUrl) {
    // No real engine configured — use the local mock.
    return NextResponse.json(mapRecord(recipe, profile, record));
  }

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
