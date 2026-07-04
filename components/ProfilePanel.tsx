import type { SourceProfile } from "@/lib/contract";

export default function ProfilePanel({ profile }: { profile: SourceProfile }) {
  return (
    <div className="animate-fade-up thin-scroll overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500">
            <th className="py-2 pr-4 font-medium">Field</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Meaning</th>
            <th className="py-2 font-medium">Sample</th>
          </tr>
        </thead>
        <tbody>
          {profile.fields.map((f, i) => (
            <tr
              key={f.name}
              className="animate-fade-up border-b border-slate-800/50 transition-colors hover:bg-slate-800/20"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <td className="py-2.5 pr-4 font-mono text-teal-300">{f.name}</td>
              <td className="py-2.5 pr-4">
                <span className="rounded-md border border-slate-700/60 bg-slate-800/40 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  {f.type}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-slate-200">{f.semantic}</td>
              <td className="py-2.5 font-mono text-slate-500">{f.sample}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
