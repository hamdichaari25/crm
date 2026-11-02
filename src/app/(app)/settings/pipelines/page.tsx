import { addStage, createPipeline, deleteStage, renamePipeline, updateStage } from "@/app/(app)/_actions/settings";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { canAdmin, getContext } from "@/lib/context";

export const metadata = { title: "Pipelines" };

export default async function PipelinesSettings() {
  const { supabase, org, role } = await getContext();
  const admin = canAdmin(role);
  const { data: pipelines } = await supabase.from("pipelines").select("id, name, is_default, stages(id, name, position, probability, kind)").eq("org_id", org.id).order("created_at");
  return (
    <>
      <PageHeader title="Pipelines et étapes" subtitle="Créez autant de pipelines que de cycles de vente (ventes directes, partenaires, renouvellements…)." />
      <div className="space-y-6">
        {(pipelines ?? []).map((p) => (
          <Card
            key={p.id}
            title={
              admin ? (
                <form action={renamePipeline.bind(null, p.id)} className="flex items-center gap-2">
                  <Input name="name" defaultValue={p.name} className="w-56" aria-label="Nom du pipeline" />
                  <Button variant="ghost" className="px-2 py-1 text-xs">Renommer</Button>
                  {p.is_default && <Badge tone="brand">par défaut</Badge>}
                </form>
              ) : p.name
            }
          >
            <ul className="space-y-2">
              {(p.stages as { id: string; name: string; position: number; probability: number; kind: string }[])
                .sort((a, b) => a.position - b.position)
                .map((s) => (
                  <li key={s.id}>
                    <form action={updateStage.bind(null, s.id)} className="flex flex-wrap items-center gap-2">
                      <Input name="position" type="number" defaultValue={s.position} className="w-16" aria-label="Ordre" disabled={!admin} />
                      <Input name="name" defaultValue={s.name} className="w-56" aria-label="Nom" disabled={!admin} />
                      <Input name="probability" type="number" min={0} max={100} defaultValue={s.probability} className="w-20" aria-label="Probabilité" disabled={!admin} />
                      <span className="text-xs text-muted">%</span>
                      {s.kind !== "open" && <Badge tone={s.kind === "won" ? "brand" : "danger"}>{s.kind === "won" ? "gagnée" : "perdue"}</Badge>}
                      {admin && <Button variant="secondary" className="px-2 py-1 text-xs">Enregistrer</Button>}
                      {admin && s.kind === "open" && <Button formAction={deleteStage.bind(null, s.id)} variant="ghost" className="px-2 py-1 text-xs text-danger">Supprimer</Button>}
                    </form>
                  </li>
                ))}
            </ul>
            {admin && (
              <form action={addStage.bind(null, p.id)} className="mt-3 flex gap-2 border-t border-line pt-3">
                <Input name="name" placeholder="Nouvelle étape" required className="w-56" />
                <Input name="probability" type="number" min={0} max={100} placeholder="%" className="w-20" />
                <Button variant="secondary">Ajouter</Button>
              </form>
            )}
          </Card>
        ))}
        {admin && (
          <Card title="Nouveau pipeline">
            <form action={createPipeline} className="space-y-3">
              <Field label="Nom"><Input name="name" required placeholder="Ex. Partenaires" /></Field>
              <Field label="Étapes (une par ligne)" hint="Les étapes « Gagnée » et « Perdue » sont ajoutées automatiquement."><Textarea name="stages" rows={4} placeholder={"Premier contact\nDémonstration\nProposition"} /></Field>
              <Button>Créer le pipeline</Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
