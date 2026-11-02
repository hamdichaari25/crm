import { createRule, deleteRule, toggleRule } from "@/app/(app)/_actions/settings";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { canAdmin, getContext } from "@/lib/context";

export const metadata = { title: "Automatisations" };

const TRIGGERS: Record<string, string> = {
  deal_stage_changed: "Une opportunité change d'étape",
  deal_created: "Une opportunité est créée",
  contact_created: "Un contact (lead) est créé",
  inbound_message: "Un client écrit (e-mail ou WhatsApp)",
};

export default async function AutomationsPage() {
  const { supabase, org, role } = await getContext();
  const admin = canAdmin(role);
  const [{ data: rules }, { data: stages }, { data: members }] = await Promise.all([
    supabase.from("automation_rules").select("*").eq("org_id", org.id).order("created_at"),
    supabase.from("stages").select("id, name, pipeline:pipelines(name)").eq("org_id", org.id).order("position"),
    supabase.from("memberships").select("user_id, profile:profiles(full_name, email)").eq("org_id", org.id),
  ]);
  const stageName = new Map((stages ?? []).map((s) => [s.id, `${(s.pipeline as unknown as { name: string })?.name} › ${s.name}`]));
  const memberName = new Map((members ?? []).map((m) => { const p = m.profile as unknown as { full_name: string | null; email: string | null }; return [m.user_id, p?.full_name || p?.email || "?"]; }));

  return (
    <>
      <PageHeader title="Automatisations" subtitle="Relances, tâches et affectation des leads, sans scénario compliqué." />
      <div className="space-y-6">
        <Card title="Règles actives">
          {(rules ?? []).length === 0 ? <p className="text-sm text-muted">Aucune règle.</p> : (
            <ul className="divide-y divide-line">
              {(rules ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <strong>{r.name}</strong> {!r.active && <Badge>en pause</Badge>}
                    <span className="block text-xs text-muted">
                      Quand : {TRIGGERS[r.trigger]}{r.conditions?.stage_id ? ` vers « ${stageName.get(r.conditions.stage_id) ?? "?"} »` : ""} → {r.action === "create_task" ? `créer la tâche « ${r.action_config.title} » à J+${r.action_config.due_in_days}` : `attribuer à tour de rôle : ${(r.action_config.user_ids ?? []).map((u: string) => memberName.get(u)).join(", ")}`}
                      {" · "}{r.run_count} exécution(s)
                    </span>
                  </span>
                  {admin && (
                    <span className="flex gap-1">
                      <form action={toggleRule.bind(null, r.id, !r.active)}><Button variant="secondary" className="px-2 py-1 text-xs">{r.active ? "Mettre en pause" : "Activer"}</Button></form>
                      <form action={deleteRule.bind(null, r.id)}><Button variant="ghost" className="px-2 py-1 text-xs text-danger">Supprimer</Button></form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {admin && (
          <Card title="Nouvelle règle">
            <form action={createRule} className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom"><Input name="name" required placeholder="Ex. Relance J+2 après rendez-vous" /></Field>
              <Field label="Déclencheur"><Select name="trigger">{Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Étape (pour « change d'étape »)">
                <Select name="stage_id" defaultValue=""><option value="">Toutes</option>{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{stageName.get(s.id)}</option>)}</Select>
              </Field>
              <Field label="Action"><Select name="action"><option value="create_task">Créer une tâche de relance</option><option value="assign_owner">Attribuer un responsable (tour de rôle)</option></Select></Field>
              <Field label="Titre de la tâche"><Input name="task_title" placeholder="Relancer le client" /></Field>
              <Field label="Échéance (jours)"><Input name="due_in_days" type="number" min={0} defaultValue={2} /></Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-xs font-medium text-muted">Commerciaux pour l&apos;attribution</legend>
                <div className="flex flex-wrap gap-3">
                  {(members ?? []).map((m) => <label key={m.user_id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="user_ids" value={m.user_id} /> {memberName.get(m.user_id)}</label>)}
                </div>
              </fieldset>
              <div className="sm:col-span-2"><Button>Créer la règle</Button></div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
