export interface AuditEntry {
  id: string;
  time: string; // HH:MM:SS
  kind: "auto" | "confirmed";
  text: string;
  link?: string; // deep link into Xero, when a real write happened
}

export default function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="card animate-fade-up overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b border-slate-800/70 bg-slate-950/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">
          audit log
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 p-4">
        {entries.map((e) => (
          <li
            key={e.id}
            className="animate-fade-up flex items-baseline gap-2 font-mono text-[11px]"
          >
            <span className="shrink-0 text-slate-600">{e.time}</span>
            <span
              className={`shrink-0 ${e.kind === "auto" ? "text-teal-400" : "text-amber-400"}`}
            >
              {e.kind === "auto" ? "auto" : "user"}
            </span>
            <span className="text-slate-300">
              {e.text}
              {e.link && (
                <>
                  {" "}
                  <a
                    href={e.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-400 underline-offset-2 hover:underline"
                  >
                    view ↗
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
