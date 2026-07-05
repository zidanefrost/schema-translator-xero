import { promises as fs } from "node:fs";
import path from "node:path";

// Server-side JSON persistence of confirmed mappings ("learned rules"), so
// learning survives across sessions. On serverless hosts set
// SPEAKSYNC_RULES_PATH to a writable location (e.g. /tmp/.speaksync-rules.json);
// failures degrade gracefully to session-only memory.

export interface LearnedRule {
  key: string; // action|fieldName|sourceField
  action: string;
  field: string;
  sourceField: string | null;
  value: string | null;
  confirmedAt: string;
  timesApplied: number;
}

interface RuleFile {
  version: 1;
  users: Record<string, LearnedRule[]>;
}

const RULES_PATH =
  process.env.SPEAKSYNC_RULES_PATH || path.join(process.cwd(), ".speaksync-rules.json");

async function readFile(): Promise<RuleFile> {
  try {
    const raw = await fs.readFile(RULES_PATH, "utf8");
    const parsed = JSON.parse(raw) as RuleFile;
    if (parsed && parsed.version === 1 && parsed.users) return parsed;
  } catch {
    /* missing/corrupt — start fresh */
  }
  return { version: 1, users: {} };
}

async function writeFile(data: RuleFile): Promise<void> {
  await fs.writeFile(RULES_PATH, JSON.stringify(data, null, 2), "utf8");
}

function userKey(userId?: string): string {
  return (userId || "local").trim().toLowerCase();
}

export async function loadRules(userId?: string): Promise<LearnedRule[]> {
  const data = await readFile();
  return data.users[userKey(userId)] ?? [];
}

export async function deleteRule(key: string, userId?: string): Promise<boolean> {
  const data = await readFile();
  const uk = userKey(userId);
  const list = data.users[uk] ?? [];
  const next = list.filter((r) => r.key !== key);
  const removed = next.length !== list.length;
  if (removed) {
    data.users[uk] = next;
    await writeFile(data);
  }
  return removed;
}

export async function saveRule(
  rule: { action: string; field: string; sourceField: string | null; value: string | null },
  userId?: string,
): Promise<LearnedRule> {
  const data = await readFile();
  const uk = userKey(userId);
  const list = data.users[uk] ?? [];
  const key = `${rule.action}|${rule.field}|${rule.sourceField ?? ""}`;
  const existing = list.find((r) => r.key === key);
  let saved: LearnedRule;
  if (existing) {
    existing.value = rule.value;
    existing.confirmedAt = new Date().toISOString();
    existing.timesApplied += 1;
    saved = existing;
  } else {
    saved = {
      key,
      action: rule.action,
      field: rule.field,
      sourceField: rule.sourceField,
      value: rule.value,
      confirmedAt: new Date().toISOString(),
      timesApplied: 1,
    };
    list.push(saved);
  }
  data.users[uk] = list;
  await writeFile(data);
  return saved;
}
