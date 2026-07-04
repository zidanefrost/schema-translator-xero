"use client";

import { useState } from "react";
import type { MappedField, MappedPayload } from "@/lib/contract";

interface ConfirmCardProps {
  payload: MappedPayload;
  threshold: number;
  onConfirm: (edits: { name: string; value: string }[]) => void;
}

export default function ConfirmCard({ payload, threshold, onConfirm }: ConfirmCardProps) {
  const lowFields: MappedField[] = payload.fields.filter((f) => f.confidence < threshold);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(lowFields.map((f) => [f.name, f.value === null ? "" : String(f.value)])),
  );

  return (
    <div className="animate-fade-up mt-4 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-amber-300">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Needs your confirmation — {lowFields.length} field
        {lowFields.length === 1 ? "" : "s"} below {Math.round(threshold * 100)}%
      </p>

      <div className="flex flex-col gap-3">
        {lowFields.map((f) => (
          <label key={f.name} className="flex flex-col gap-1.5 text-xs">
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-teal-300">{f.name}</span>
              <span className="text-slate-500">{f.rationale}</span>
            </span>
            <input
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              placeholder="(empty — fill in or accept as blank)"
              className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 font-mono text-xs text-slate-200 outline-none transition-colors focus:border-amber-400"
            />
          </label>
        ))}
      </div>

      <button
        onClick={() =>
          onConfirm(lowFields.map((f) => ({ name: f.name, value: values[f.name] ?? "" })))
        }
        className="mt-4 rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 shadow-[0_4px_16px_rgba(245,158,11,0.3)] transition-all hover:-translate-y-px hover:bg-amber-400"
      >
        Confirm &amp; sync
      </button>
    </div>
  );
}
