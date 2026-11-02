import Link from "next/link";
import { notFound } from "next/navigation";
import { createQuoteFromDeal, deleteDeal, updateDeal } from "@/app/(app)/_actions/deals";
import { createTask, toggleTask } from "@/app/(app)/_actions/tasks";
import { Timeline, type Activity } from "@/components/timeline";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { getContext } from "@/lib/context";
import { CURRENCIES, QUOTE_STATUS, fullName, money, relative } from "@/lib/format";

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const { supabase, org } = await getContext();
  const { data: d } = await supabase
    .from("deals")
    .select("*, stage:stages(id, name, probability, kind), contact:contacts(id, first_name, last_name, email, phone), company:companies(id, name)")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!d) notFound();
  const [{ data: stages }, { data: acts }, { data: quotes }, { data: tasks }, { data: members }, { data: contacts }, { data: companies }] = await Promise.all([
    supabase.from("stages").select("id, name").eq("pipeline_id", d.pipeline_id).order("position"),
    supabase.from("activities").select("id, type, direction, subject, body, occurred_at, source, duration_seconds, meta").eq("deal_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("quotes").select("id, number, status, total, currency, created_at").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, title, due_at, done_at").eq("deal_id", id).order("done_at", { nullsFirst: true }).order("due_at"),
    supabase.from("memberships").select("user_id, profile:profiles(full_name, email)").eq("org_id", org.id),
    supabase.from("contacts").select("id, first_name, last_name, email").eq("org_id", org.id).limit(300),
    supabase.from("companies").select("id, name").eq("org_id", org.id).order("name").limit(300),
  ]);
  const stage = d.stage as { id: string; name: string; probability: number; kind: string };
  const contact = d.contact as { id: string; first_name: string; last_name: string } | null;
  const company = d.company as { id: string; name: string } | null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{d.title}</h1>
            <p className="text-sm text-muted">
              <Badge tone={d.status === "won" ? "brand" : d.status === "lost" ? "danger" : "neutral"}>{stage.name}</Badge>{" "}
              {money(d.amount, d.currency)} · {d.probability ?? stage.probability} % ·{" "}
              {contact && <Link className="text-brand" href={`/contacts/${contact.id}`}>{fullName(contact)}</Link>}
              {company && <> · <Link className="text-brand" href={`/companies/${company.id}`}>{company.name}</Link></>}
            </p>
          </div>
          <form action={createQuoteFromDeal.bind(null, id)}>
            <Button>Créer un devis</Button>
          </form>
        </div>
        <Card title="Devis">
          {(quotes ?? []).length === 0 ? (
            <p className="text-sm text-muted">Aucun devis. Le devis reprendra automatiquement le client, le montant et la devise de l&apos;opportunité.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {(quotes ?? []).map((q) => (
                <li key={q.id} className="flex items-center justify-between">
                  <Link className="font-medium hover:underline" href={`/quotes/${q.id}`}>{q.number}</Link>
                  <span className="flex items-center gap-2"><span className="tabular-nums">{money(q.total, q.currency)}</span><Badge>{QUOTE_STATUS[q.status]}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Historique de l'opportunité"><Timeline items={(acts ?? []) as Activity[]} /></Card>
      </div>
      <aside className="space-y-6">
        <Card title="Détails">
          <form action={updateDeal.bind(null, id)} className="space-y-3">
            <Field label="Titre"><Input name="title" defaultValue={d.title} required /></Field>
            <Field label="Étape">
              <Select name="stage_id" defaultValue={d.stage_id}>{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <Field label="Montant HT"><Input name="amount" type="number" step="0.01" min={0} defaultValue={d.amount} /></Field>
              <Field label="Devise"><Select name="currency" defaultValue={d.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Probabilité (%)" hint={`Défaut de l'étape : ${stage.probability} %`}><Input name="probability" type="number" min={0} max={100} defaultValue={d.probability ?? ""} /></Field>
              <Field label="Signature prévue"><Input name="expected_close_date" type="date" defaultValue={d.expected_close_date ?? ""} /></Field>
            </div>
            <Field label="Contact">
              <Select name="contact_id" defaultValue={d.contact_id ?? ""}>
                <option value="">—</option>
                {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
              </Select>
            </Field>
            <Field label="Entreprise">
              <Select name="company_id" defaultValue={d.company_id ?? ""}>
                <option value="">—</option>
                {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Responsable">
              <Select name="owner_id" defaultValue={d.owner_id ?? ""}>
                <option value="">—</option>
                {(members ?? []).map((m) => {
                  const p = m.profile as unknown as { full_name: string | null; email: string | null } | null;
                  return <option key={m.user_id} value={m.user_id}>{p?.full_name || p?.email}</option>;
                })}
              </Select>
            </Field>
            <Button className="w-full">Enregistrer</Button>
          </form>
        </Card>
        <Card title="Tâches">
          <ul className="space-y-1.5 text-sm">
            {(tasks ?? []).map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <form action={toggleTask.bind(null, t.id, !t.done_at)}><button aria-label="Basculer" className={`mt-0.5 h-4 w-4 rounded border ${t.done_at ? "border-brand bg-brand" : "border-line"}`} /></form>
                <span className={t.done_at ? "text-muted line-through" : ""}>{t.title} <span className="text-xs text-muted">{relative(t.due_at)}</span></span>
              </li>
            ))}
          </ul>
          <form action={createTask} className="mt-3 flex gap-2">
            <input type="hidden" name="deal_id" value={id} />
            {contact && <input type="hidden" name="contact_id" value={contact.id} />}
            <Input name="title" placeholder="Nouvelle tâche…" required />
            <Input name="due_at" type="date" className="w-36" aria-label="Échéance" />
            <Button variant="secondary">+</Button>
          </form>
        </Card>
        <form action={deleteDeal.bind(null, id)}><Button variant="ghost" className="w-full text-danger">Supprimer l&apos;opportunité</Button></form>
      </aside>
    </div>
  );
}
