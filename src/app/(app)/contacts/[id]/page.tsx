import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteContact, sendWhatsApp, updateContact } from "@/app/(app)/_actions/contacts";
import { createDeal } from "@/app/(app)/_actions/deals";
import { createTask, toggleTask } from "@/app/(app)/_actions/tasks";
import { AiPanel, type Suggestion } from "@/components/ai-panel";
import { NoteComposer } from "@/components/note-composer";
import { Timeline, type Activity } from "@/components/timeline";
import { Badge, Button, Card, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { aiEnabled } from "@/lib/ai/analyze";
import { getContext } from "@/lib/context";
import { date, fullName, money, relative } from "@/lib/format";

export default async function ContactPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org } = await getContext();

  const { data: c } = await supabase.from("contacts").select("*, company:companies(id, name, city)").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!c) notFound();

  const [{ data: acts }, { data: deals }, { data: tasks }, { data: sugs }, { data: companies }, { data: members }, { data: pipelines }, { data: wa }] = await Promise.all([
    supabase.from("activities").select("id, type, direction, subject, body, occurred_at, source, duration_seconds, from_address, meta").eq("contact_id", id).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("deals").select("id, title, amount, currency, status, stage:stages(name)").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, title, due_at, done_at, source").eq("contact_id", id).order("done_at", { ascending: true, nullsFirst: true }).order("due_at").limit(20),
    supabase.from("ai_suggestions").select("id, kind, target_type, status, model, payload, previous_value, source_activity_ids, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("companies").select("id, name").eq("org_id", org.id).order("name").limit(500),
    supabase.from("memberships").select("user_id, profile:profiles(full_name, email)").eq("org_id", org.id),
    supabase.from("pipelines").select("id, name").eq("org_id", org.id).order("is_default", { ascending: false }),
    supabase.from("channel_connections").select("status").eq("org_id", org.id).eq("provider", "whatsapp").maybeSingle(),
  ]);

  const company = c.company as { id: string; name: string; city: string | null } | null;
  const timeline = (acts ?? []) as Activity[];
  // Numérotation des messages pour les citations [n]
  const index = new Map([...timeline].reverse().map((a, i) => [a.id, i + 1]));
  const suggestions = (sugs ?? []) as Suggestion[];
  const highlight = new Set(suggestions.filter((s) => s.status === "pending").flatMap((s) => s.source_activity_ids));
  const draftId = typeof sp.draft === "string" ? sp.draft : null;
  const draft = draftId ? suggestions.find((s) => s.id === draftId) : null;
  const custom = (c.custom ?? {}) as Record<string, string>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{fullName(c)}</h1>
            <p className="text-sm text-muted">
              {[c.job_title, company && <Link key="co" href={`/companies/${company.id}`} className="text-brand hover:underline">{company.name}</Link>, c.city].filter(Boolean).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, " · ", x] : [x]), [])}
            </p>
            <p className="mt-1 text-xs text-muted">Dernier échange {relative(c.last_activity_at)} · créé {date(c.created_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.phone && <LinkButton href={`tel:${c.phone}`} variant="secondary">☎ Appeler</LinkButton>}
            {c.email && <LinkButton href={`mailto:${c.email}`} variant="secondary">✉ E-mail</LinkButton>}
            {c.phone && <LinkButton href="#whatsapp" variant="secondary">◍ WhatsApp</LinkButton>}
          </div>
        </div>

        <Card title="Ajouter au fil">
          <NoteComposer contactId={id} />
        </Card>

        <Card title={`Fil client · ${timeline.length} élément(s)`}>
          <Timeline items={timeline} highlight={highlight} />
        </Card>

        <Card title="WhatsApp" className="scroll-mt-20" >
          <div id="whatsapp" className="scroll-mt-24" />
          {!c.phone ? (
            <p className="text-sm text-muted">Ajoutez un numéro de téléphone pour échanger sur WhatsApp.</p>
          ) : !c.whatsapp_consent ? (
            <p className="text-sm text-muted">Consentement WhatsApp non recueilli. Cochez-le dans les informations du contact une fois obtenu.</p>
          ) : (
            <form action={sendWhatsApp.bind(null, id)} className="space-y-2">
              <Textarea name="text" rows={3} required defaultValue={draft ? String(draft.payload.text ?? "") : ""} placeholder="Votre message…" />
              <div className="flex items-center gap-2">
                <Button>Envoyer</Button>
                {wa?.status !== "connected" && <span className="text-xs text-warn">WhatsApp Business non connecté : le message sera journalisé sans être envoyé.</span>}
              </div>
              <p className="text-xs text-muted">Hors fenêtre de 24 h après le dernier message du client, Meta impose un modèle approuvé.</p>
            </form>
          )}
        </Card>
      </div>

      <aside className="space-y-6">
        <AiPanel contactId={id} suggestions={suggestions} activityIndex={index} aiLive={aiEnabled()} />

        <Card title="Opportunités" action={<span className="text-xs text-muted">{deals?.length ?? 0}</span>}>
          <ul className="space-y-2 text-sm">
            {(deals ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <Link href={`/deals/${d.id}`} className="truncate font-medium hover:underline">{d.title}</Link>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums">{money(d.amount, d.currency)}</span>
                  <Badge tone={d.status === "won" ? "brand" : d.status === "lost" ? "danger" : "neutral"}>{(d.stage as unknown as { name: string } | null)?.name}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-brand">+ Nouvelle opportunité</summary>
            <form action={createDeal} className="mt-2 space-y-2">
              <input type="hidden" name="contact_id" value={id} />
              <Input name="title" placeholder="Titre" required defaultValue={company ? `${company.name} — ` : ""} />
              <div className="flex gap-2">
                <Input name="amount" type="number" min={0} step="0.01" placeholder="Montant" />
                <Select name="pipeline_id" aria-label="Pipeline">{(pipelines ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </div>
              <Button className="w-full">Créer</Button>
            </form>
          </details>
        </Card>

        <Card title="Relances & tâches">
          <ul className="space-y-1.5 text-sm">
            {(tasks ?? []).map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <form action={toggleTask.bind(null, t.id, !t.done_at)}>
                  <button aria-label={t.done_at ? "Rouvrir" : "Terminer"} className={`mt-0.5 h-4 w-4 rounded border ${t.done_at ? "border-brand bg-brand" : "border-line"}`} />
                </form>
                <span className={t.done_at ? "text-muted line-through" : ""}>
                  {t.title}
                  <span className="block text-xs text-muted">{t.due_at ? relative(t.due_at) : "sans échéance"}{t.source !== "manual" ? ` · ${t.source === "rule" ? "règle" : "IA"}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
          <form action={createTask} className="mt-3 flex gap-2">
            <input type="hidden" name="contact_id" value={id} />
            <Input name="title" placeholder="Nouvelle relance…" required />
            <Input name="due_at" type="date" className="w-36" aria-label="Échéance" />
            <Button variant="secondary">+</Button>
          </form>
        </Card>

        <Card title="Informations">
          <form action={updateContact.bind(null, id)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Prénom"><Input name="first_name" defaultValue={c.first_name ?? ""} /></Field>
              <Field label="Nom"><Input name="last_name" defaultValue={c.last_name ?? ""} /></Field>
            </div>
            <Field label="E-mail"><Input name="email" type="email" defaultValue={c.email ?? ""} /></Field>
            <Field label="Téléphone"><Input name="phone" defaultValue={c.phone ?? ""} /></Field>
            <Field label="Fonction"><Input name="job_title" defaultValue={c.job_title ?? ""} /></Field>
            <Field label="Ville"><Input name="city" defaultValue={c.city ?? ""} /></Field>
            <Field label="Entreprise">
              <Select name="company_id" defaultValue={c.company_id ?? ""}>
                <option value="">—</option>
                {(companies ?? []).map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
              </Select>
            </Field>
            <Field label="Responsable">
              <Select name="owner_id" defaultValue={c.owner_id ?? ""}>
                <option value="">—</option>
                {(members ?? []).map((m) => {
                  const p = m.profile as unknown as { full_name: string | null; email: string | null } | null;
                  return <option key={m.user_id} value={m.user_id}>{p?.full_name || p?.email}</option>;
                })}
              </Select>
            </Field>
            <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={c.notes ?? ""} /></Field>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted">Champs personnalisés</legend>
              {Object.entries(custom).map(([k, v]) => (
                <Field key={k} label={k}><Input name={`custom.${k}`} defaultValue={v} /></Field>
              ))}
              <NewCustomField />
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="whatsapp_consent" defaultChecked={c.whatsapp_consent} /> Consentement WhatsApp
              {c.whatsapp_consent_at && <span className="text-xs text-muted">({date(c.whatsapp_consent_at)})</span>}
            </label>
            <Button className="w-full">Enregistrer</Button>
          </form>
          <form action={deleteContact.bind(null, id)} className="mt-3">
            <Button variant="ghost" className="w-full text-danger">Supprimer le contact</Button>
          </form>
        </Card>
      </aside>
    </div>
  );
}

function NewCustomField() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input name="new_custom_key" placeholder="Nouveau champ (ex. Secteur)" aria-label="Nom du nouveau champ" />
      <Input name="new_custom_value" placeholder="Valeur" aria-label="Valeur du nouveau champ" />
    </div>
  );
}
