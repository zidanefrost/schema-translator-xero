import type { MappedPayload, Recipe, SourceProfile, SourceRecord } from "@/lib/contract";
import { mapRecord } from "@/lib/mockMapper";
import {
  staticCompileIntent,
  staticDiscoverSchema,
  staticExtractRecords,
} from "@/lib/staticDemo";

// Single client entry point for the three pipeline calls. In dev/production
// they hit the server routes (LLM + mock mapper). In the static GitHub Pages
// build (NEXT_PUBLIC_STATIC=1) they run entirely in the browser.

export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === "1";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function compileIntent(instruction: string): Promise<Recipe> {
  if (IS_STATIC) return staticCompileIntent(instruction);
  return post<Recipe>("/api/compile-intent", { instruction });
}

export async function discoverSchema(payload: string): Promise<SourceProfile> {
  if (IS_STATIC) return staticDiscoverSchema(payload);
  return post<SourceProfile>("/api/discover-schema", { payload });
}

export async function extractRecords(payload: string): Promise<SourceRecord[]> {
  if (IS_STATIC) return staticExtractRecords(payload);
  const data = await post<{ records: SourceRecord[] }>("/api/extract-records", { payload });
  return data.records;
}

export async function mapPayload(
  recipe: Recipe | null,
  profile: SourceProfile | null,
  record: SourceRecord,
): Promise<MappedPayload> {
  if (IS_STATIC) return mapRecord(recipe, profile, record);
  return post<MappedPayload>("/api/map", { recipe, profile, record });
}

export type { ExecuteResult } from "@/lib/contract";
import type { ExecuteResult as ExecResult } from "@/lib/contract";

// Sentinel thrown when no Xero executor is configured — the UI degrades to
// a simulated sync instead of showing an error on every row.
export class ExecutorUnavailableError extends Error {}

export interface LearnedRule {
  key: string;
  action: string;
  field: string;
  sourceField: string | null;
  value: string | null;
  confirmedAt: string;
  timesApplied: number;
}

export async function loadRules(user?: string): Promise<LearnedRule[]> {
  if (IS_STATIC) return [];
  try {
    const res = await fetch(`/api/rules${user ? `?user=${encodeURIComponent(user)}` : ""}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { rules: LearnedRule[] };
    return data.rules ?? [];
  } catch {
    return [];
  }
}

export async function saveRule(rule: {
  user?: string;
  action: string;
  field: string;
  sourceField: string | null;
  value: string | null;
}): Promise<void> {
  if (IS_STATIC) return;
  try {
    await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
  } catch {
    /* non-fatal */
  }
}

export async function forgetRule(key: string, user?: string): Promise<void> {
  if (IS_STATIC) return;
  try {
    await fetch("/api/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, user }),
    });
  } catch {
    /* non-fatal */
  }
}

// Write a (possibly human-edited) MappedPayload to Xero.
// Call this when a row auto-syncs or after the user accepts a ConfirmCard.
// In the static build there is no backend, so callers should not invoke it.
export async function executePayload(payload: MappedPayload): Promise<ExecResult> {
  if (IS_STATIC) {
    throw new ExecutorUnavailableError("static build");
  }
  const res = await fetch("/api/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (res.status === 503) {
    throw new ExecutorUnavailableError(data.error ?? "executor not configured");
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Execute failed (${res.status})`);
  }
  return data as ExecResult;
}
