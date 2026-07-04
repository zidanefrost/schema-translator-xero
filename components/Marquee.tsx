const ITEMS = [
  "any source",
  "→ xero",
  "runtime schema discovery",
  "confidence scored",
  "human in the loop",
  "no hardcoded connectors",
];

export default function Marquee() {
  return (
    <div className="marquee py-3">
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={copy === 1}>
            {ITEMS.map((item) => (
              <span key={item} className="flex items-center gap-10">
                <span className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
                  {item}
                </span>
                <span className="text-teal-400/50">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
