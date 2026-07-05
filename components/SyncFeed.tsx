"use client";

import type { MappedPayload } from "@/lib/contract";
import ConfirmCard from "@/components/ConfirmCard";
import CountUp from "@/components/CountUp";

export interface ExecuteState {
  state: "writing" | "done" | "failed" | "simulated";
  deepLink?: string;
  xeroStatus?: string;
  error?: string;
}

export interface SyncItem {
  id: string;
  payload: MappedPayload;
  status: "synced" | "pending";
  execute?: ExecuteState;
}

export function confidenceColor(c: number): string {
  if (c >= 0.8) return "bg-emerald-500";
  if (c >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

export function confidenceText(c: number): string {
  if (c >= 0.8) return "text-emerald-400";
  if (c >= 0.6) return "text-amber-400";
  return "text-red-400";
}

function ConfidenceBadge({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
        <span
          className={`grow-bar block h-full rounded-full ${confidenceColor(value)}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span className={`font-mono text-[11px] tabular-nums ${confidenceText(value)}`}>
        <CountUp value={Math.round(value * 100)} />%
      </span>
    </span>
  );
}

interface SyncFeedProps {
  items: SyncItem[];
  threshold: number;
  onConfirm: (id: string, edits: { name: string; value: string }[]) => void;
  onChallenge?: (id: string) => void;
}

export default function SyncFeed({ items, threshold, onConfirm, onChallenge }: SyncFeedProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => {
        const { id, payload, status } = item;
        return (
          <article
            key={id}
            className={`card animate-fade-up rounded-2xl p-5 transition-colors ${
              status === "pending" ? "!border-amber-500/40" : "sync-flash"
            }`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2.5 py-0.5 font-mono text-xs text-teal-300">
                {payload.action}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  payload.contact.match === "existing"
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border border-purple-500/40 bg-purple-500/10 text-purple-300"
                }`}
              >
                {payload.contact.match === "existing"
                  ? `↔ ${payload.contact.name} (${payload.contact.contact_id})`
                  : `+ new contact: ${payload.contact.name}`}
              </span>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${
                  status === "pending"
                    ? "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : item.execute?.state === "failed"
                      ? "border border-red-500/40 bg-red-500/10 text-red-300"
                      : "badge-pop border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {(status === "pending" || item.execute?.state === "writing") && (
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
                {status === "pending"
                  ? "awaiting confirmation"
                  : item.execute?.state === "writing"
                    ? "writing to Xero…"
                    : item.execute?.state === "done"
                      ? `✓ in Xero · ${item.execute.xeroStatus ?? "DRAFT"}`
                      : item.execute?.state === "failed"
                        ? "✕ Xero write failed"
                        : item.execute?.state === "simulated"
                          ? "✓ synced · simulated"
                          : "✓ synced"}
              </span>
              {item.execute?.state === "done" && item.execute.deepLink && (
                <a
                  href={item.execute.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2.5 py-0.5 text-xs text-teal-300 transition-colors hover:bg-teal-500/20"
                >
                  View in Xero ↗
                </a>
              )}
              {item.execute?.state === "failed" && item.execute.error && (
                <span className="max-w-xs truncate text-xs text-red-400" title={item.execute.error}>
                  {item.execute.error}
                </span>
              )}
              {status === "synced" && item.execute?.state !== "writing" && onChallenge && (
                <button
                  onClick={() => onChallenge(id)}
                  title="Mark this mapping as wrong — reopens it and forgets any learned rule behind it"
                  className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-300 transition-colors hover:bg-red-500/20"
                >
                  ✕ Challenge
                </button>
              )}
              <span className="ml-auto">
                <ConfidenceBadge value={payload.overall_confidence} />
              </span>
            </div>

            <div className="thin-scroll overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">Xero field</th>
                    <th className="py-1.5 pr-3 font-medium">Value</th>
                    <th className="py-1.5 pr-3 font-medium">From</th>
                    <th className="py-1.5 pr-3 font-medium">Confidence</th>
                    <th className="py-1.5 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.fields.map((f) => (
                    <tr
                      key={f.name}
                      className="border-b border-slate-800/50 align-top transition-colors hover:bg-slate-800/20"
                    >
                      <td className="py-2 pr-3 font-mono text-teal-300">{f.name}</td>
                      <td className="py-2 pr-3 font-mono text-slate-200">
                        {f.value === null || f.value === "" ? (
                          <span className="text-red-400">—</span>
                        ) : (
                          String(f.value)
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-500">
                        {f.source_field ?? "recipe"}
                      </td>
                      <td className="py-2 pr-3">
                        <ConfidenceBadge value={f.confidence} />
                      </td>
                      <td className="py-2 text-slate-400">{f.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {status === "pending" && (
              <ConfirmCard
                payload={payload}
                threshold={threshold}
                onConfirm={(edits) => onConfirm(id, edits)}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}
