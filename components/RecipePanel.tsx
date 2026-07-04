import type { Recipe } from "@/lib/contract";

export default function RecipePanel({ recipe }: { recipe: Recipe }) {
  return (
    <div className="animate-fade-up flex flex-col gap-4 text-xs">
      <p className="leading-relaxed text-slate-300">{recipe.intent}</p>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: "Trigger", value: `${recipe.trigger.source} · ${recipe.trigger.event}` },
          {
            label: "Entity resolution",
            value: `${recipe.entity_resolution.entity} ← ${recipe.entity_resolution.match_on}`,
          },
          { label: "Invoice status", value: recipe.guardrails.invoice_status ?? "n/a" },
          {
            label: "Confirm below",
            value: `${Math.round(recipe.guardrails.confirm_below_confidence * 100)}% confidence`,
          },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{t.label}</p>
            <p className="font-mono text-slate-200">{t.value}</p>
          </div>
        ))}
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-slate-500 transition-colors hover:text-teal-300">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          Raw recipe JSON
        </summary>
        <pre className="thin-scroll mt-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-4 font-mono text-[11px] leading-relaxed text-slate-300">
          {JSON.stringify(recipe, null, 2)}
        </pre>
      </details>
    </div>
  );
}
