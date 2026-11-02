import Link from "next/link";
import { createDeal } from "@/app/(app)/_actions/deals";
import { Kanban, type KanbanDeal, type KanbanStage } from "@/components/kanban";
import { Button, Input, PageHeader, Select, cx } from "@/components/ui";
import { getContext } from "@/lib/context";
import { money } from "@/lib/format";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const sp = await searchParams;
  const { supabase, org } = await getContext();
  const { data: pipelines } = await supabase.from("pipelines").select("id, name, is_default").eq("org_id", org.id).order("is_default", { ascending: false }).order("created_at");
  const current = (pipelines ?? []).find((p) => p.id === sp.p) ?? pipelines?.[0];
  if (!current) return <p>Aucun pipeline.</p>;

  const [{ data: stages }, { data: deals }, { data: contacts }] = await Promise.all([
    supabase.from("stages").select("id, name, position, probability, kind").eq("pipeline_id", current.id).order("position"),
    supabase
      .from("deals")
      .select("id, title, amount, currency, probability, stage_id, position, expected_close_date, owner_id, contact:contacts(id, first_name, last_name), company:companies(name)")
      .eq("pipeline_id", current.id)
      .order("position")
      .limit(1000),
    supabase.from("contacts").select("id, first_name, last_name, email").eq("org_id", org.id).order("last_activity_at", { ascending: false, nullsFirst: false }).limit(300),
  ]);

  const open = (deals ?? []).filter((d) => (stages ?? []).find((s) => s.id === d.stage_id)?.kind === "open");
  // PIP-03 : prévision pondérée, recalculée à chaque changement (rendu serveur + revalidation)
  const weighted = open.reduce((s, d) => s + Number(d.amount) * ((d.probability ?? stages?.find((st) => st.id === d.stage_id)?.probability ?? 0) / 100), 0);
  const total = open.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={<>Ouvert : <strong className="tabular-nums">{money(total, org.default_currency)}</strong> · Prévision pondérée : <strong className="tabular-nums">{money(weighted, org.default_currency)}</strong></>}
        actions={
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-ink">+ Opportunité</summary>
            <form action={createDeal} className="absolute right-0 z-30 mt-2 w-80 space-y-2 rounded-xl border border-line bg-panel p-3 shadow-lg">
              <input type="hidden" name="pipeline_id" value={current.id} />
              <input type="hidden" name="stay" value="1" />
              <Input name="title" placeholder="Titre" required />
              <Input name="amount" type="number" min={0} step="0.01" placeholder={`Montant (${org.default_currency})`} />
              <Select name="contact_id" defaultValue="" aria-label="Contact">
                <option value="">— Contact —</option>
                {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</option>)}
              </Select>
              <Input name="expected_close_date" type="date" aria-label="Date de signature prévue" />
              <Button className="w-full">Créer</Button>
            </form>
          </details>
        }
      />
      {(pipelines ?? []).length > 1 && (
        <nav className="mb-4 flex gap-1 overflow-x-auto" aria-label="Pipelines">
          {(pipelines ?? []).map((p) => (
            <Link key={p.id} href={`?p=${p.id}`} className={cx("rounded-lg px-3 py-1.5 text-sm", p.id === current.id ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-panel")}>{p.name}</Link>
          ))}
          <Link href="/settings/pipelines" className="px-3 py-1.5 text-sm text-muted">Gérer…</Link>
        </nav>
      )}
      <Kanban
        pipelineId={current.id}
        stages={(stages ?? []) as KanbanStage[]}
        deals={(deals ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          amount: Number(d.amount),
          currency: d.currency,
          stage_id: d.stage_id,
          position: d.position,
          expected_close_date: d.expected_close_date,
          contact: d.contact as unknown as KanbanDeal["contact"],
          company: (d.company as unknown as { name: string } | null)?.name ?? null,
        }))}
      />
    </>
  );
}
