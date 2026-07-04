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

// Result of a real Xero write via Dev A's Executor.
export interface ExecuteResult {
  id: string;
  deep_link: string;
  status: string;
}

// Write a (possibly human-edited) MappedPayload to Xero via Dev A.
// Call this when a row auto-syncs or after the user accepts a ConfirmCard.
// In the static build there is no backend, so this is a no-op stub.
export async function executePayload(payload: MappedPayload): Promise<ExecuteResult> {
  if (IS_STATIC) {
    return { id: "static-demo", deep_link: "#", status: "DRAFT" };
  }
  return post<ExecuteResult>("/api/execute", payload);
}
