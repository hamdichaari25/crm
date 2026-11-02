import Link from "next/link";
import { ignoreInboxItem, linkInboxToContact } from "@/app/(app)/_actions/inbox";
import { Badge, Button, Card, Empty, LinkButton, PageHeader, Select } from "@/components/ui";
import { getContext } from "@/lib/context";
import { ACTIVITY_LABELS, fullName, relative } from "@/lib/format";

export const metadata = { title: "À traiter" };

const KIND: Record<string, string> = { field_update: "Mise à jour de champ", create_deal: "Opportunité détectée", next_action: "Prochaine action", draft: "Brouillon de relance", summary: "Résumé" };

/** Parcours A : messages entrants non rattachés + propositions de l'IA à valider. */
export default async function InboxPage() {
  const { supabase, org } = await getContext();
  const [{ data: items }, { data: sugs }, { data: contacts }] = await Promise.all([
    supabase.from("inbox_items").select("*").eq("org_id", org.id).eq("status", "pending").order("occurred_at", { ascending: false }).limit(100),
    supabase.from("ai_suggestions").select("id, kind, payload, created_at, contact:contacts(id, first_name, last_name, email)").eq("org_id", org.id).eq("status", "pending").neq("kind", "summary").order("created_at", { ascending: false }).limit(100),
    supabase.from("contacts").select("id, first_name, last_name, email, phone").eq("org_id", org.id).order("last_activity_at", { ascending: false, nullsFirst: false }).limit(300),
  ]);

  return (
    <>
      <PageHeader title="À traiter" subtitle="Nouveaux interlocuteurs et propositions de l'assistant." />
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-muted">Messages d&apos;expéditeurs inconnus · {items?.length ?? 0}</h2>
        {(items ?? []).length === 0 ? (
          <Empty title="Aucun message en attente">Les messages d&apos;expéditeurs connus sont rattachés automatiquement à leur fiche.</Empty>
        ) : (
          <div className="space-y-3">
            {(items ?? []).map((it) => {
              const isPhone = it.channel === "whatsapp" || it.channel === "call";
              const q = new URLSearchParams({ inbox: it.id, ...(isPhone ? { phone: it.from_address ?? "" } : { email: it.from_address ?? "" }), ...(it.from_name ? { name: it.from_name } : {}) });
              return (
                <Card key={it.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm"><Badge tone="brand">{ACTIVITY_LABELS[it.channel] ?? it.channel}</Badge> <strong>{it.from_name ?? it.from_address}</strong> <span className="text-muted">{it.from_name ? it.from_address : ""} · {relative(it.occurred_at)}</span></p>
                      {it.subject && <p className="mt-1 text-sm font-medium">{it.subject}</p>}
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{it.body}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <LinkButton href={`/contacts/new?${q}`}>Créer le contact</LinkButton>
                      <form action={linkInboxToContact.bind(null, it.id)} className="flex gap-1">
                        <Select name="contact_id" aria-label="Rattacher à" className="w-44" required defaultValue="">
                          <option value="" disabled>Rattacher à…</option>
                          {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                        </Select>
                        <Button variant="secondary">OK</Button>
                      </form>
                      <form action={ignoreInboxItem.bind(null, it.id)}><Button variant="ghost" className="w-full text-xs">Ignorer</Button></form>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">Propositions de l&apos;assistant · {sugs?.length ?? 0}</h2>
        {(sugs ?? []).length === 0 ? (
          <Empty title="Rien à valider">Lancez « Analyser le fil » depuis une fiche contact.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {(sugs ?? []).map((s) => {
              const c = s.contact as unknown as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
              const p = s.payload as Record<string, unknown>;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <Badge>{KIND[s.kind] ?? s.kind}</Badge> <span className="truncate">{String(p.title ?? p.field ?? p.text ?? "").slice(0, 90)}</span>
                    {c && <span className="block text-xs text-muted">{fullName(c)}</span>}
                  </span>
                  {c && <Link href={`/contacts/${c.id}`} className="shrink-0 text-brand">Valider sur la fiche →</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
