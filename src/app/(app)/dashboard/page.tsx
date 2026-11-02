import Link from "next/link";
import { Badge, Card, LinkButton, PageHeader, Select, Stat } from "@/components/ui";
import { getContext } from "@/lib/context";
import { ACTIVITY_LABELS, money, nowMs, relative } from "@/lib/format";

export const metadata = { title: "Tableau de bord" };

const PERIODS: Record<string, { label: string; days: number }> = {
  "7": { label: "7 derniers jours", days: 7 },
  "30": { label: "30 derniers jours", days: 30 },
  "90": { label: "Trimestre glissant", days: 90 },
  "365": { label: "12 derniers mois", days: 365 },
};

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const period = PERIODS[String(sp.period ?? "30")] ? String(sp.period ?? "30") : "30";
  const owner = typeof sp.owner === "string" && sp.owner ? sp.owner : null;
  const since = new Date(nowMs() - PERIODS[period].days * 86400000).toISOString();
  const { supabase, org, user } = await getContext();
  const cur = org.default_currency;

  let openQ = supabase.from("deals").select("id, amount, currency, probability, stage:stages(id, name, position, probability), owner_id").eq("org_id", org.id).eq("status", "open");
  let wonQ = supabase.from("deals").select("amount").eq("org_id", org.id).eq("status", "won").gte("closed_at", since);
  let lostQ = supabase.from("deals").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "lost").gte("closed_at", since);
  const actQ = supabase.from("activities").select("type, source, created_by, contact:contacts(owner_id)").eq("org_id", org.id).gte("occurred_at", since).limit(5000);
  let taskQ = supabase.from("tasks").select("id, title, due_at, contact:contacts(id, first_name, last_name), deal:deals(id, title)").eq("org_id", org.id).is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(6);
  if (owner) {
    openQ = openQ.eq("owner_id", owner);
    wonQ = wonQ.eq("owner_id", owner);
    lostQ = lostQ.eq("owner_id", owner);
    taskQ = taskQ.eq("assignee_id", owner);
  }

  const [{ data: open }, { data: won }, { count: lost }, { data: acts }, { data: tasks }, { data: members }, { data: quality }, { count: contactCount }, { data: channels }, { data: recent }] = await Promise.all([
    openQ,
    wonQ,
    lostQ,
    actQ,
    taskQ,
    supabase.from("memberships").select("user_id, profile:profiles(full_name, email)").eq("org_id", org.id),
    supabase.rpc("data_quality", { p_org: org.id }),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", org.id),
    supabase.from("channel_connections").select("provider, status").eq("org_id", org.id),
    supabase.from("activities").select("id, type, subject, body, occurred_at, source, contact:contacts(id, first_name, last_name)").eq("org_id", org.id).order("occurred_at", { ascending: false }).limit(8),
  ]);

  type StageRef = { id: string; name: string; position: number; probability: number };
  const openDeals = (open ?? []).map((d) => ({ ...d, stage: d.stage as unknown as StageRef }));
  const pipelineValue = openDeals.reduce((s, d) => s + Number(d.amount), 0);
  const weighted = openDeals.reduce((s, d) => s + Number(d.amount) * ((d.probability ?? d.stage?.probability ?? 0) / 100), 0);
  const wonValue = (won ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const winRate = (won?.length ?? 0) + (lost ?? 0) > 0 ? Math.round((100 * (won?.length ?? 0)) / ((won?.length ?? 0) + (lost ?? 0))) : null;

  const byStage = new Map<string, { name: string; position: number; count: number; value: number }>();
  for (const d of openDeals) {
    if (!d.stage) continue;
    const e = byStage.get(d.stage.id) ?? { name: d.stage.name, position: d.stage.position, count: 0, value: 0 };
    e.count++;
    e.value += Number(d.amount);
    byStage.set(d.stage.id, e);
  }
  const stages = [...byStage.values()].sort((a, b) => a.position - b.position);
  const maxStage = Math.max(1, ...stages.map((s) => s.value));

  const filteredActs = (acts ?? []).filter((a) => !owner || a.created_by === owner || (a.contact as unknown as { owner_id: string } | null)?.owner_id === owner);
  const byType = new Map<string, number>();
  for (const a of filteredActs) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
  const auto = filteredActs.filter((a) => ["auto", "ai", "rule"].includes(a.source)).length;
  const autoRate = filteredActs.length ? Math.round((100 * auto) / filteredActs.length) : 0;
  const maxType = Math.max(1, ...byType.values());

  const q = (quality ?? {}) as { score?: number; duplicates?: number; minutes_saved_30d?: number; ai_acceptance_as_is_rate?: number | null };
  const hasMail = (channels ?? []).some((c) => ["gmail", "microsoft365", "whatsapp"].includes(c.provider) && c.status === "connected");
  const checklist = [
    { done: (contactCount ?? 0) > 0, label: "Importer ou créer vos contacts", href: "/import" },
    { done: hasMail, label: "Connecter votre messagerie ou WhatsApp", href: "/settings/channels" },
    { done: (members?.length ?? 0) > 1, label: "Inviter votre équipe", href: "/settings/team" },
    { done: openDeals.length > 0 || (won?.length ?? 0) > 0, label: "Créer votre première opportunité", href: "/pipeline" },
  ];

  return (
    <>
      <PageHeader
        title={sp.welcome ? `Bienvenue dans ${org.name}` : "Tableau de bord"}
        subtitle="Pipeline, activités et prévisions — sans configuration."
        actions={
          <form className="flex gap-2">
            <Select name="owner" defaultValue={owner ?? ""} className="w-auto" aria-label="Personne">
              <option value="">Toute l&apos;équipe</option>
              {(members ?? []).map((m) => {
                const p = m.profile as unknown as { full_name: string | null; email: string | null } | null;
                return <option key={m.user_id} value={m.user_id}>{m.user_id === user.id ? "Moi" : p?.full_name || p?.email}</option>;
              })}
            </Select>
            <Select name="period" defaultValue={period} className="w-auto" aria-label="Période">
              {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <button className="rounded-lg border border-line bg-panel px-3 text-sm">Filtrer</button>
          </form>
        }
      />

      {checklist.some((c) => !c.done) && (
        <Card className="mb-6" title="Mise en route">
          <ol className="grid gap-2 sm:grid-cols-2">
            {checklist.map((c, i) => (
              <li key={i}>
                <Link href={c.href} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-bg">
                  <span className={c.done ? "text-brand" : "text-muted"}>{c.done ? "✓" : i + 1}</span>
                  <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pipeline ouvert" value={money(pipelineValue, cur)} hint={`${openDeals.length} opportunités`} />
        <Stat label="Prévision pondérée" value={money(weighted, cur)} hint="Montant × probabilité" />
        <Stat label="Gagné sur la période" value={money(wonValue, cur)} hint={winRate === null ? "—" : `Taux de transformation ${winRate} %`} />
        <Stat label="Capture automatique" value={`${autoRate} %`} hint={`${auto} / ${filteredActs.length} activités sans saisie`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Pipeline par étape" className="lg:col-span-2" action={<LinkButton href="/pipeline" variant="ghost">Ouvrir le Kanban →</LinkButton>}>
          {stages.length === 0 ? (
            <p className="text-sm text-muted">Aucune opportunité ouverte.</p>
          ) : (
            <ul className="space-y-3">
              {stages.map((s) => (
                <li key={s.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{s.name} <span className="text-muted">· {s.count}</span></span>
                    <span className="tabular-nums">{money(s.value, cur)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg" aria-hidden>
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${(100 * s.value) / maxStage}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Qualité des données">
          <p className="text-3xl font-semibold tabular-nums">{q.score ?? 0}<span className="text-base text-muted"> / 100</span></p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>{q.duplicates ?? 0} doublon(s) potentiel(s) {q.duplicates ? <Link className="text-brand underline" href="/contacts/duplicates">traiter</Link> : null}</li>
            <li>≈ {Math.round((q.minutes_saved_30d ?? 0) / 6) / 10} h de saisie évitées sur 30 jours</li>
            <li>IA acceptée sans modification : {q.ai_acceptance_as_is_rate ?? "—"}{q.ai_acceptance_as_is_rate != null ? " %" : ""}</li>
          </ul>
        </Card>

        <Card title="Activités sur la période">
          {byType.size === 0 ? (
            <p className="text-sm text-muted">Aucune activité.</p>
          ) : (
            <ul className="space-y-2">
              {[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <li key={t} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0">{ACTIVITY_LABELS[t] ?? t}</span>
                  <div className="h-2 flex-1 rounded-full bg-bg" aria-hidden><div className="h-2 rounded-full bg-brand/70" style={{ width: `${(100 * n) / maxType}%` }} /></div>
                  <span className="w-10 text-right tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Prochaines relances" action={<LinkButton href="/tasks" variant="ghost">Tout voir →</LinkButton>}>
          {(tasks ?? []).length === 0 ? (
            <p className="text-sm text-muted">Rien à relancer. 🎉</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(tasks ?? []).map((t) => {
                const c = t.contact as unknown as { id: string; first_name: string; last_name: string } | null;
                const late = t.due_at && new Date(t.due_at).getTime() < nowMs();
                return (
                  <li key={t.id} className="flex items-start justify-between gap-2">
                    <span>
                      {t.title}
                      {c && <Link href={`/contacts/${c.id}`} className="block text-xs text-muted">{[c.first_name, c.last_name].join(" ")}</Link>}
                    </span>
                    <Badge tone={late ? "danger" : "neutral"}>{relative(t.due_at)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Derniers échanges capturés">
          <ul className="space-y-2 text-sm">
            {(recent ?? []).map((a) => {
              const c = a.contact as unknown as { id: string; first_name: string; last_name: string } | null;
              return (
                <li key={a.id} className="flex gap-2">
                  <Badge tone={a.source === "manual" ? "neutral" : "brand"}>{ACTIVITY_LABELS[a.type]}</Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {c ? <Link className="font-medium" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].join(" ")}</Link> : null} {a.subject || a.body}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{relative(a.occurred_at)}</span>
                </li>
              );
            })}
            {(recent ?? []).length === 0 && <li className="text-muted">Aucun échange pour l&apos;instant.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
