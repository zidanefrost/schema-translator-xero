import { NextResponse } from "next/server";
import { loadRules, saveRule, deleteRule } from "@/lib/ruleMemory";

// Rule memory endpoints: GET (load), POST (save), DELETE (forget).

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = url.searchParams.get("user") ?? undefined;
  try {
    return NextResponse.json({ rules: await loadRules(user) });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not load rule memory", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: {
    user?: string;
    action?: string;
    field?: string;
    sourceField?: string | null;
    value?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.action || !body.field) {
    return NextResponse.json({ error: "action and field are required" }, { status: 400 });
  }
  try {
    const rule = await saveRule(
      {
        action: body.action,
        field: body.field,
        sourceField: body.sourceField ?? null,
        value: body.value ?? null,
      },
      body.user,
    );
    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not save rule", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  let body: { key?: string; user?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ removed: await deleteRule(body.key, body.user) });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not delete rule", detail: String(err) },
      { status: 500 },
    );
  }
}
