import { NextResponse } from "next/server";
import { mapRecord } from "@/lib/mockMapper";
import type { Recipe, SourceProfile, SourceRecord } from "@/lib/contract";

// MOCK of the Mapping Engine — thin HTTP wrapper around lib/mockMapper.
// The real engine replaces this endpoint; shapes stay identical.

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

  return NextResponse.json(mapRecord(recipe, profile, record));
}
