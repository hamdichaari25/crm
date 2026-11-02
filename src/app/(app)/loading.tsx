export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="h-6 w-48 rounded bg-line" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-line/60" />)}</div>
      <div className="h-64 rounded-xl bg-line/40" />
    </div>
  );
}
