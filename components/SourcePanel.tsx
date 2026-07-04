"use client";

import { useRef, useState } from "react";
import { discoverSchema, extractRecords } from "@/lib/api";
import type { SourceProfile } from "@/lib/contract";

const QUICK_SOURCES = [
  {
    label: "CRM deals",
    desc: "JSON · clean + messy rows",
    path: "mock/deals.json",
    extract: false,
    icon: "M20 7l-8-4-8 4v10l8 4 8-4V7z",
  },
  {
    label: "Mystery CSV",
    desc: "Cryptic headers, unknown origin",
    path: "mock/unknown.csv",
    extract: false,
    icon: "M9.5 14.5L5 19m0 0h4m-4 0v-4M14.5 9.5L19 5m0 0h-4m4 0v4",
  },
  {
    label: "Stripe payments",
    desc: "Webhook events",
    path: "mock/payments.json",
    extract: false,
    icon: "M3 10h18M7 15h2m4 0h4M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z",
  },
  {
    label: "Slack thread",
    desc: "#sales-wins · plain chatter",
    path: "mock/slack.json",
    extract: true,
    icon: "M8 12a4 4 0 118 0 4 4 0 01-8 0zM3 21l2.6-2.6A9 9 0 1121 12a9 9 0 01-15.4 6.4L3 21z",
  },
  {
    label: "Email inbox",
    desc: "Deal confirmations in prose",
    path: "mock/emails.json",
    extract: true,
    icon: "M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
  },
];

// Random header synonyms for the "prove nothing is hardcoded" demo moment:
// scramble the Mystery CSV's column names live and rediscover.
const HEADER_SYNONYMS: Record<string, string[]> = {
  cust_nm: ["client", "customer_ref", "buyer", "account_name"],
  amt_gbp: ["total_amt", "price_quoted", "value_gbp", "gross_amount"],
  dt_closed: ["closed_on", "win_date", "date_won", "closed_at"],
  deal: ["service_item", "product_line", "engagement", "work_description"],
  stage: ["pipeline_phase", "deal_state", "status_code"],
};

function scrambleHeaders(csv: string): string {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => {
    const options = HEADER_SYNONYMS[h.trim()];
    return options ? options[Math.floor(Math.random() * options.length)] : h;
  });
  return [headers.join(","), ...lines.slice(1)].join("\n");
}

interface SourcePanelProps {
  onDiscovered: (profile: SourceProfile, rawText: string) => void;
}

export default function SourcePanel({ onDiscovered }: SourcePanelProps) {
  const [text, setText] = useState("");
  const [busySource, setBusySource] = useState<string | null>(null); // path | "paste"
  const [phase, setPhase] = useState<"extract" | "discover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function discover(raw: string, sourceKey: string, alreadyBusy = false) {
    if (!raw.trim() || (busySource && !alreadyBusy)) return;
    setBusySource(sourceKey);
    setPhase("discover");
    setError(null);
    try {
      const profile: SourceProfile = await discoverSchema(raw);
      onDiscovered(profile, raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusySource(null);
      setPhase(null);
    }
  }

  /** Unstructured text (Slack/email) → extract flat records → discover on those. */
  async function extractThenDiscover(raw: string, sourceKey: string) {
    if (!raw.trim() || busySource) return;
    setBusySource(sourceKey);
    setPhase("extract");
    setError(null);
    try {
      const records = await extractRecords(raw);
      const extracted = JSON.stringify(records, null, 2);
      setText(extracted);
      await discover(extracted, sourceKey, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusySource(null);
      setPhase(null);
    }
  }

  async function loadSource(path: string, extract: boolean) {
    if (busySource) return;
    setError(null);
    const res = await fetch(path);
    const raw = await res.text();
    setText(raw);
    if (extract) {
      await extractThenDiscover(raw, path);
    } else {
      await discover(raw, path);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setText(await file.text());
    setShowPaste(true);
  }

  const busyLabel = phase === "extract" ? "Reading messages…" : "Discovering…";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {QUICK_SOURCES.map((s) => {
          const busy = busySource === s.path;
          return (
            <button
              key={s.path}
              onClick={() => loadSource(s.path, s.extract)}
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
                {busy ? busyLabel : s.label}
              </span>
              <span className="text-xs text-slate-500">{s.desc}</span>
              {s.extract && !busy && (
                <span className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-mono text-[10px] text-purple-300">
                  unstructured
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-5">
        <button
          onClick={async () => {
            if (busySource) return;
            setError(null);
            const res = await fetch("mock/unknown.csv");
            const scrambled = scrambleHeaders(await res.text());
            setText(scrambled);
            setShowPaste(true);
            await discover(scrambled, "scramble");
          }}
          disabled={busySource !== null}
          className="text-xs text-slate-500 underline-offset-4 transition-colors hover:text-purple-300 hover:underline disabled:opacity-40"
          title="Randomise the Mystery CSV's column names and rediscover — proof nothing is hardcoded"
        >
          {busySource === "scramble" ? "🎲 discovering scrambled headers…" : "🎲 scramble the CSV headers"}
        </button>
        <button
          onClick={() => setShowPaste((v) => !v)}
          className="text-xs text-slate-500 underline-offset-4 transition-colors hover:text-teal-300 hover:underline"
        >
          {showPaste ? "Hide paste box" : "…or paste / upload your own data"}
        </button>
      </div>

      {showPaste && (
        <div className="animate-fade-up flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste anything — JSON, CSV, a webhook body, a Slack thread, an email…"
            spellCheck={false}
            className="thin-scroll card h-40 w-full resize-y rounded-2xl p-4 font-mono text-xs text-slate-200 outline-none transition-colors focus:border-teal-500/60"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => discover(text, "paste")}
              disabled={busySource !== null || !text.trim()}
              className="btn-primary rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-30"
            >
              {busySource === "paste" && phase === "discover" ? "Discovering…" : "Discover schema"}
            </button>
            <button
              onClick={() => extractThenDiscover(text, "paste")}
              disabled={busySource !== null || !text.trim()}
              className="rounded-xl border border-purple-500/50 px-4 py-2 text-sm text-purple-300 transition-colors hover:border-purple-400 hover:bg-purple-500/10 disabled:opacity-30"
            >
              {busySource === "paste" && phase === "extract"
                ? "Reading messages…"
                : "It's messages / emails"}
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
              accept=".json,.csv,.txt,.eml"
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
