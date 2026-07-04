"use client";

import { useRef, useState } from "react";
import type { SourceProfile } from "@/lib/contract";

const QUICK_SOURCES = [
  {
    label: "CRM deals",
    desc: "JSON · clean + messy rows",
    path: "/mock/deals.json",
    icon: "M20 7l-8-4-8 4v10l8 4 8-4V7z",
  },
  {
    label: "Mystery CSV",
    desc: "Cryptic headers, unknown origin",
    path: "/mock/unknown.csv",
    icon: "M9.5 14.5L5 19m0 0h4m-4 0v-4M14.5 9.5L19 5m0 0h-4m4 0v4",
  },
  {
    label: "Stripe payments",
    desc: "Webhook events",
    path: "/mock/payments.json",
    icon: "M3 10h18M7 15h2m4 0h4M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z",
  },
];

interface SourcePanelProps {
  onDiscovered: (profile: SourceProfile, rawText: string) => void;
}

export default function SourcePanel({ onDiscovered }: SourcePanelProps) {
  const [text, setText] = useState("");
  const [busySource, setBusySource] = useState<string | null>(null); // path | "paste"
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function discover(raw: string, sourceKey: string) {
    if (!raw.trim() || busySource) return;
    setBusySource(sourceKey);
    setError(null);
    try {
      const res = await fetch("/api/discover-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: raw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      onDiscovered(data as SourceProfile, raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusySource(null);
    }
  }

  async function loadAndDiscover(path: string) {
    if (busySource) return;
    setError(null);
    const res = await fetch(path);
    const raw = await res.text();
    setText(raw);
    await discover(raw, path);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const raw = await file.text();
    setText(raw);
    setShowPaste(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_SOURCES.map((s) => {
          const busy = busySource === s.path;
          return (
            <button
              key={s.path}
              onClick={() => loadAndDiscover(s.path)}
              disabled={busySource !== null}
              className="card card-glow group flex flex-col items-start gap-2 rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-300 transition-colors group-hover:border-purple-500/40 group-hover:text-purple-300">
                {busy ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.2-8.56" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d={s.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-sm font-semibold text-slate-100">
                {busy ? "Discovering…" : s.label}
              </span>
              <span className="text-xs text-slate-500">{s.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <button
          onClick={() => setShowPaste((v) => !v)}
          className="text-xs text-slate-500 underline-offset-4 transition-colors hover:text-teal-300 hover:underline"
        >
          {showPaste ? "Hide" : "…or paste / upload your own data"}
        </button>
      </div>

      {showPaste && (
        <div className="animate-fade-up flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste any payload — JSON, CSV, or a webhook body…"
            spellCheck={false}
            className="thin-scroll card h-40 w-full resize-y rounded-2xl p-4 font-mono text-xs text-slate-200 outline-none transition-colors focus:border-teal-500/60"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => discover(text, "paste")}
              disabled={busySource !== null || !text.trim()}
              className="btn-primary rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-30"
            >
              {busySource === "paste" ? "Discovering…" : "Discover schema"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-teal-500/60 hover:text-teal-300"
            >
              Upload file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        </div>
      )}

      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
