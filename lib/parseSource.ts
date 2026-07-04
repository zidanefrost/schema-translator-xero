import type { SourceRecord } from "@/lib/contract";

/**
 * Turn raw source text into an array of records.
 * JSON array → its objects; JSON object → single record; otherwise CSV with header row.
 */
export function parseRecords(raw: string): SourceRecord[] {
  const text = raw.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((r): r is SourceRecord => r !== null && typeof r === "object");
    }
    if (parsed !== null && typeof parsed === "object") {
      return [parsed as SourceRecord];
    }
  } catch {
    // not JSON — fall through to CSV
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const record: SourceRecord = {};
    headers.forEach((h, i) => {
      record[h] = cells[i] ?? "";
    });
    return record;
  });
}

/** Split one CSV line, honouring double-quoted cells (e.g. "£1,200.00"). */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}
