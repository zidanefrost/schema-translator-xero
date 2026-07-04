"use client";

import { useState } from "react";
import { compileIntent } from "@/lib/api";
import type { Recipe } from "@/lib/contract";

const EXAMPLES = [
  "For each closed deal, create a draft invoice in Xero for that customer",
  "When a Stripe payment succeeds, record it against the matching invoice",
];

interface DescribeBoxProps {
  onCompiled: (recipe: Recipe) => void;
}

export default function DescribeBox({ onCompiled }: DescribeBoxProps) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compile(text?: string) {
    const finalText = text ?? instruction;
    if (!finalText.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const recipe: Recipe = await compileIntent(finalText);
      onCompiled(recipe);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card card-glow flex items-center gap-2 rounded-2xl p-2 pl-4 transition-colors">
        <svg
          className={`h-5 w-5 shrink-0 ${busy ? "animate-spin text-purple-400" : "text-teal-400"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {busy ? (
            <path d="M21 12a9 9 0 11-6.2-8.56" strokeLinecap="round" />
          ) : (
            <path
              d="M12 3l1.9 5.7L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.3L12 3z"
              strokeLinejoin="round"
            />
          )}
        </svg>
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") compile();
          }}
          placeholder="Describe the integration in plain English…"
          className="w-full bg-transparent py-2 text-sm text-slate-100 placeholder-slate-500 outline-none"
        />
        <button
          onClick={() => compile()}
          disabled={busy || !instruction.trim()}
          className="btn-primary shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-30"
        >
          {busy ? "Compiling…" : "Compile"}
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setInstruction(ex);
              compile(ex);
            }}
            disabled={busy}
            className="rounded-full border border-slate-700/70 bg-slate-900/40 px-3.5 py-1.5 text-xs text-slate-400 transition-all hover:border-purple-500/60 hover:text-purple-300 hover:shadow-[0_0_16px_rgba(168,85,247,0.25)] disabled:opacity-40"
          >
            “{ex}”
          </button>
        ))}
      </div>

      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
