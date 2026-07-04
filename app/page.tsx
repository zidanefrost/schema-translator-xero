"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import DescribeBox from "@/components/DescribeBox";
import RecipePanel from "@/components/RecipePanel";
import SourcePanel from "@/components/SourcePanel";
import ProfilePanel from "@/components/ProfilePanel";
import SyncFeed, { type SyncItem, type ExecuteState } from "@/components/SyncFeed";
import AuditLog, { type AuditEntry } from "@/components/AuditLog";
import Marquee from "@/components/Marquee";
import Reveal from "@/components/Reveal";
import Magnetic from "@/components/Magnetic";
import SpotlightFX from "@/components/SpotlightFX";
import { parseRecords } from "@/lib/parseSource";
import { IS_STATIC, mapPayload, executePayload, ExecutorUnavailableError } from "@/lib/api";
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
    <section className="relative">
      <span aria-hidden className={`ghost-num ${done ? "ghost-num-done" : ""}`}>
        0{index}
      </span>

      <button
        onClick={onToggle}
        disabled={!onToggle}
        className="group relative z-10 mb-5 flex w-full items-center gap-3 text-left"
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
        <span
          className={`text-xl font-bold tracking-tight sm:text-2xl ${
            open || done ? "text-slate-100" : "text-slate-500"
          }`}
        >
          {title}
        </span>
        {summary && !open && (
          <span className="ml-1 hidden sm:flex sm:items-center sm:gap-2">{summary}</span>
        )}
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
      {open && <div className="relative z-10 pl-0 sm:pl-11">{children}</div>}
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
  const [watching, setWatching] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [openRecipe, setOpenRecipe] = useState(false);
  const [openSource, setOpenSource] = useState(false);

  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

  // Once we learn no Xero executor is configured, stop trying: every row
  // becomes a clearly-labelled simulated sync instead of an error.
  const simulatedRef = useRef(IS_STATIC);
  // Mappings the human has confirmed this session:
  // "action|fieldName|sourceField" -> auto-apply next time.
  const learnedRef = useRef<Set<string>>(new Set());
  const watchCounter = useRef(0);
  const watchIndex = useRef(0);

  const threshold = recipe?.guardrails?.confirm_below_confidence ?? 0.8;
  const canRun = recipe !== null && profile !== null && records.length > 0 && !running;
  const syncedCount = feed.filter((i) => i.status === "synced").length;
  const pendingCount = feed.filter((i) => i.status === "pending").length;
  const inXeroCount = feed.filter((i) => i.execute?.state === "done").length;

  // Glide to the next step as each one completes.
  useEffect(() => {
    if (recipe) {
      const t = setTimeout(() => step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
      return () => clearTimeout(t);
    }
  }, [recipe]);
  useEffect(() => {
    if (profile) {
      const t = setTimeout(() => step3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
      return () => clearTimeout(t);
    }
  }, [profile]);

  function logAudit(kind: AuditEntry["kind"], text: string, link?: string) {
    setAudit((prev) => [
      ...prev,
      { id: `audit-${Date.now()}-${prev.length}`, time: now(), kind, text, link },
    ]);
  }

  function learnedKey(action: string, fieldName: string, sourceField: string | null): string {
    return `${action}|${fieldName}|${sourceField ?? ""}`;
  }

  /** Boost fields the human already confirmed this session. */
  function applyLearned(payload: MappedPayload): MappedPayload {
    let changed = false;
    const fields = payload.fields.map((f) => {
      if (
        f.confidence < threshold &&
        learnedRef.current.has(learnedKey(payload.action, f.name, f.source_field))
      ) {
        changed = true;
        return {
          ...f,
          confidence: 0.96,
          rationale: "Auto-applied — you confirmed this mapping earlier this session.",
        };
      }
      return f;
    });
    if (!changed) return payload;
    const overall =
      Math.round((fields.reduce((s, f) => s + f.confidence, 0) / fields.length) * 100) / 100;
    return {
      ...payload,
      fields,
      overall_confidence: overall,
      needs_confirmation:
        fields.some((f) => f.confidence < threshold) || payload.contact.confidence < threshold,
    };
  }

  function markExecute(id: string, execute: ExecuteState) {
    setFeed((prev) => prev.map((it) => (it.id === id ? { ...it, execute } : it)));
  }

  /** Write a synced row to Xero (or degrade to a labelled simulation). */
  async function executeRow(id: string, payload: MappedPayload, kind: AuditEntry["kind"]) {
    const who = payload.contact.name;
    if (simulatedRef.current) {
      markExecute(id, { state: "simulated" });
      logAudit(kind, `Synced ${payload.action} for ${who} (simulated — no Xero executor).`);
      return;
    }
    try {
      const result = await executePayload(payload);
      markExecute(id, { state: "done", deepLink: result.deep_link, xeroStatus: result.status });
      logAudit(kind, `Created ${payload.action} in Xero for ${who} (${result.status}).`, result.deep_link);
    } catch (e) {
      if (e instanceof ExecutorUnavailableError) {
        simulatedRef.current = true;
        markExecute(id, { state: "simulated" });
        logAudit(kind, `Synced ${payload.action} for ${who} (simulated — no Xero executor configured).`);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        markExecute(id, { state: "failed", error: msg });
        logAudit(kind, `Xero write FAILED for ${who}: ${msg}`);
      }
    }
  }

  /** Map one record, add it to the feed, and execute it if it clears the bar. */
  async function processRecord(record: SourceRecord, id: string): Promise<void> {
    const raw = await mapPayload(recipe, profile, record);
    const payload = applyLearned(raw);
    const status: SyncItem["status"] = payload.needs_confirmation ? "pending" : "synced";
    setFeed((prev) => [
      ...prev,
      { id, payload, status, execute: status === "synced" ? { state: "writing" } : undefined },
    ]);
    if (status === "synced") {
      await executeRow(id, payload, "auto");
    }
  }

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setRunError(null);
    setFeed([]);
    try {
      for (let i = 0; i < records.length; i++) {
        await processRecord(records[i], `row-${i}`);
        if (IS_STATIC && i < records.length - 1) await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  // Watch mode: simulate live events arriving from the source.
  useEffect(() => {
    if (!watching || !recipe || !profile || records.length === 0) return;
    const t = setInterval(() => {
      const record = records[watchIndex.current % records.length];
      watchIndex.current += 1;
      const id = `watch-${watchCounter.current++}`;
      processRecord(record, id).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, recipe, profile, records]);

  function confirmItem(id: string, edits: { name: string; value: string }[]) {
    const item = feed.find((it) => it.id === id);
    if (!item) return;

    const editMap = new Map(edits.map((e) => [e.name, e.value]));
    const fields = item.payload.fields.map((f) => {
      if (!editMap.has(f.name)) return f;
      const newValue = editMap.get(f.name) || null;
      // Accepting the mapped value as-is teaches the system this mapping
      // is fine; an edited value fixes this row without generalising.
      if (String(f.value ?? "") === String(newValue ?? "")) {
        learnedRef.current.add(learnedKey(item.payload.action, f.name, f.source_field));
      }
      return { ...f, value: newValue, confidence: 1, rationale: "Confirmed by user." };
    });
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
        .join(", ")} — ${payload.action} for ${payload.contact.name}.`,
    );
    setFeed((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, payload, status: "synced" as const, execute: { state: "writing" as const } } : it,
      ),
    );
    void executeRow(id, payload, "confirmed");
  }

  return (
    <main className="min-h-screen text-slate-100">
      <div className="backdrop-glow" />
      <div className="backdrop-grid" />
      <div className="grain" />
      <SpotlightFX />

      {/* Hero */}
      <section className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />

        <p className="animate-fade-up mb-6 inline-block rounded-full border border-slate-700/80 bg-slate-900/80 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.35em] text-slate-400">
          xero hackathon · bounty 02
        </p>
        <h1 className="hero-title gradient-text animate-fade-up delay-1">SpeakSync</h1>
        <p className="animate-fade-up delay-2 mx-auto mt-7 max-w-xl text-lg leading-relaxed text-slate-300">
          Point at <span className="font-semibold text-white">any</span> business data. Say what
          should happen in Xero. Watch it map itself — confidence-scored, human-checked.
        </p>
        <div className="animate-fade-up delay-3 mt-10">
          <Magnetic strength={0.35}>
            <button
              onClick={() =>
                document.getElementById("builder")?.scrollIntoView({ behavior: "smooth" })
              }
              className="btn-primary rounded-full px-10 py-4 text-base font-semibold text-white"
            >
              Start building ↓
            </button>
          </Magnetic>
        </div>

        <div className="scroll-cue absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-500">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      <Marquee />

      {/* Builder */}
      <div id="builder" className="mx-auto flex max-w-4xl scroll-mt-10 flex-col gap-20 px-6 pb-32 pt-24">
        {/* Step 1 — Describe */}
        <Reveal>
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
                  setWatching(false);
                }}
              />
              {recipe && <RecipePanel recipe={recipe} />}
            </div>
          </StepSection>
        </Reveal>

        {/* Step 2 — Source */}
        {recipe && (
          <div ref={step2Ref} className="scroll-mt-16">
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
                    setWatching(false);
                    setOpenSource(false);
                  }}
                />
                {profile && <ProfilePanel profile={profile} />}
              </div>
            </StepSection>
          </div>
        )}

        {/* Step 3 — Sync */}
        {recipe && profile && (
          <div ref={step3Ref} className="scroll-mt-16">
            <StepSection index={3} title="Sync" done={feed.length > 0 && pendingCount === 0} open>
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Magnetic strength={0.2}>
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
                  </Magnetic>
                  <button
                    onClick={() => setWatching((v) => !v)}
                    disabled={!recipe || !profile || records.length === 0}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-30 ${
                      watching
                        ? "border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                        : "border-slate-700 text-slate-300 hover:border-teal-500/60 hover:text-teal-300"
                    }`}
                  >
                    {watching ? "◼ Stop watching" : "▶ Watch source"}
                  </button>
                  {watching && (
                    <span className="flex items-center gap-1.5 font-mono text-xs text-teal-300">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-teal-400" />
                      live — syncing new events as they arrive
                    </span>
                  )}
                  {feed.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Chip tone="teal">{syncedCount} synced</Chip>
                      {inXeroCount > 0 && <Chip tone="purple">{inXeroCount} in Xero</Chip>}
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
          </div>
        )}
      </div>

      <Marquee />
      <footer className="px-6 py-8 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-slate-600">
        speaksync · any source → xero
        {IS_STATIC && (
          <span className="mt-2 block normal-case tracking-normal text-slate-700">
            static demo — sample sources use canned AI responses; run locally for live LLM calls
          </span>
        )}
      </footer>
    </main>
  );
}
