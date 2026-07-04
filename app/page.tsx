"use client";

import { useState, type ReactNode } from "react";
import DescribeBox from "@/components/DescribeBox";
import RecipePanel from "@/components/RecipePanel";
import SourcePanel from "@/components/SourcePanel";
import ProfilePanel from "@/components/ProfilePanel";
import SyncFeed, { type SyncItem } from "@/components/SyncFeed";
import AuditLog, { type AuditEntry } from "@/components/AuditLog";
import { parseRecords } from "@/lib/parseSource";
import type { MappedPayload, Recipe, SourceProfile, SourceRecord } from "@/lib/contract";

function now(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

// ---------------------------------------------------------------------------

interface StepSectionProps {
  index: number;
  title: string;
  done: boolean;
  summary?: ReactNode;
  open: boolean;
  onToggle?: () => void;
  children: ReactNode;
}

function StepSection({ index, title, done, summary, open, onToggle, children }: StepSectionProps) {
  return (
    <section className="animate-fade-up">
      <button
        onClick={onToggle}
        disabled={!onToggle}
        className="group mb-4 flex w-full items-center gap-3 text-left"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all ${
            done
              ? "bg-gradient-to-br from-teal-400 to-purple-500 text-white shadow-[0_0_18px_rgba(45,212,191,0.35)]"
              : open
                ? "border-2 border-teal-400/70 text-teal-300"
                : "border border-slate-700 text-slate-500"
          }`}
        >
          {done ? "✓" : index}
        </span>
        <span className={`text-lg font-semibold ${open || done ? "text-slate-100" : "text-slate-500"}`}>
          {title}
        </span>
        {summary && !open && <span className="ml-1 hidden sm:flex sm:items-center sm:gap-2">{summary}</span>}
        {onToggle && (
          <span
            className={`ml-auto text-slate-600 transition-transform group-hover:text-teal-300 ${
              open ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
        )}
      </button>
      {open && <div className="pl-0 sm:pl-11">{children}</div>}
    </section>
  );
}

function Chip({ tone, children }: { tone: "teal" | "purple" | "slate"; children: ReactNode }) {
  const tones = {
    teal: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    purple: "border-purple-500/40 bg-purple-500/10 text-purple-300",
    slate: "border-slate-700 bg-slate-800/40 text-slate-400",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------

export default function Home() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [profile, setProfile] = useState<SourceProfile | null>(null);
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [feed, setFeed] = useState<SyncItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [openRecipe, setOpenRecipe] = useState(false);
  const [openSource, setOpenSource] = useState(false);

  const threshold = recipe?.guardrails?.confirm_below_confidence ?? 0.8;
  const canRun = recipe !== null && profile !== null && records.length > 0 && !running;
  const syncedCount = feed.filter((i) => i.status === "synced").length;
  const pendingCount = feed.filter((i) => i.status === "pending").length;

  function logAudit(kind: AuditEntry["kind"], text: string) {
    setAudit((prev) => [
      ...prev,
      { id: `audit-${Date.now()}-${prev.length}`, time: now(), kind, text },
    ]);
  }

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setRunError(null);
    setFeed([]);
    try {
      for (let i = 0; i < records.length; i++) {
        const res = await fetch("/api/map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipe, profile, record: records[i] }),
        });
        const data = await res.json();
        if (!res.ok) {
          setRunError(data.error ?? `Mapping failed on record ${i + 1} (${res.status})`);
          break;
        }
        const payload = data as MappedPayload;
        const status: SyncItem["status"] = payload.needs_confirmation ? "pending" : "synced";
        setFeed((prev) => [...prev, { id: `row-${i}`, payload, status }]);
        if (status === "synced") {
          logAudit(
            "auto",
            `Auto-synced ${payload.action} for ${payload.contact.name} at ${Math.round(
              payload.overall_confidence * 100,
            )}% confidence.`,
          );
        }
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function confirmItem(id: string, edits: { name: string; value: string }[]) {
    setFeed((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const editMap = new Map(edits.map((e) => [e.name, e.value]));
        const fields = item.payload.fields.map((f) =>
          editMap.has(f.name)
            ? {
                ...f,
                value: editMap.get(f.name) || null,
                confidence: 1,
                rationale: "Confirmed by user.",
              }
            : f,
        );
        const overall =
          Math.round((fields.reduce((s, f) => s + f.confidence, 0) / fields.length) * 100) / 100;
        const payload: MappedPayload = {
          ...item.payload,
          fields,
          overall_confidence: overall,
          needs_confirmation: false,
        };
        logAudit(
          "confirmed",
          `User confirmed ${edits
            .map((e) => `${e.name} = "${e.value || "(blank)"}"`)
            .join(", ")} — ${payload.action} for ${payload.contact.name} synced.`,
        );
        return { ...item, payload, status: "synced" as const };
      }),
    );
  }

  return (
    <main className="min-h-screen px-6 pb-24 pt-16 text-slate-100">
      <div className="backdrop-glow" />
      <div className="backdrop-grid" />

      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        {/* Hero */}
        <header className="animate-fade-up text-center">
          <p className="mb-3 inline-block rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-slate-500">
            any source → xero
          </p>
          <h1 className="gradient-text text-5xl font-extrabold tracking-tight sm:text-6xl">
            SpeakSync
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
            Point at any business data, say what should happen in Xero, and watch it map
            itself — with confidence scores and a human in the loop when it matters.
          </p>
        </header>

        {/* Step 1 — Describe */}
        <StepSection
          index={1}
          title="Describe it"
          done={recipe !== null}
          open={recipe === null || openRecipe}
          onToggle={recipe ? () => setOpenRecipe((v) => !v) : undefined}
          summary={
            recipe && (
              <>
                <Chip tone="teal">{recipe.target.action}</Chip>
                <span className="max-w-xs truncate text-xs text-slate-500">{recipe.name}</span>
              </>
            )
          }
        >
          <div className="flex flex-col gap-5">
            <DescribeBox
              onCompiled={(r) => {
                setRecipe(r);
                setOpenRecipe(false);
                setFeed([]);
              }}
            />
            {recipe && <RecipePanel recipe={recipe} />}
          </div>
        </StepSection>

        {/* Step 2 — Source */}
        {recipe && (
          <StepSection
            index={2}
            title="Point at your data"
            done={profile !== null}
            open={profile === null || openSource}
            onToggle={profile ? () => setOpenSource((v) => !v) : undefined}
            summary={
              profile && (
                <>
                  <Chip tone="purple">{profile.detected_format}</Chip>
                  <span className="text-xs text-slate-500">
                    {profile.fields.length} fields · {records.length} records
                  </span>
                </>
              )
            }
          >
            <div className="flex flex-col gap-5">
              <SourcePanel
                onDiscovered={(p, raw) => {
                  setProfile(p);
                  setRecords(parseRecords(raw));
                  setFeed([]);
                  setOpenSource(false);
                }}
              />
              {profile && <ProfilePanel profile={profile} />}
            </div>
          </StepSection>
        )}

        {/* Step 3 — Sync */}
        {recipe && profile && (
          <StepSection
            index={3}
            title="Sync"
            done={feed.length > 0 && pendingCount === 0}
            open
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={run}
                  disabled={!canRun}
                  className="btn-primary rounded-xl px-7 py-3 text-sm font-semibold text-white disabled:opacity-30"
                >
                  {running ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6.2-8.56" strokeLinecap="round" />
                      </svg>
                      Syncing…
                    </span>
                  ) : (
                    `Run sync · ${records.length} records`
                  )}
                </button>
                {feed.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Chip tone="teal">{syncedCount} synced</Chip>
                    {pendingCount > 0 && (
                      <span className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-300">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {pendingCount} awaiting you
                      </span>
                    )}
                  </div>
                )}
                {runError && <p className="text-xs text-red-400">{runError}</p>}
              </div>

              <SyncFeed items={feed} threshold={threshold} onConfirm={confirmItem} />
              <AuditLog entries={audit} />
            </div>
          </StepSection>
        )}
      </div>
    </main>
  );
}
