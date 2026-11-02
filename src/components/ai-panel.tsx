import Link from "next/link";
import { acceptSuggestion, analyzeContact, rejectSuggestion, revertSuggestion } from "@/app/(app)/_actions/ai";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

export type Suggestion = {
  id: string;
  kind: string;
  target_type: string;
  status: string;
  model: string | null;
  payload: Record<string, unknown>;
  previous_value: Record<string, unknown> | null;
  source_activity_ids: string[];
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "Prénom", last_name: "Nom", job_title: "Fonction", phone: "Téléphone", email: "E-mail", city: "Ville",
  title: "Titre de l'opportunité", amount: "Montant", expected_close_date: "Date de signature prévue",
};

function Sources({ ids, index }: { ids: string[]; index: Map<string, number> }) {
  if (!ids?.length) return null;
  return (
    <span className="ml-1 inline-flex gap-1">
      {ids.map((id) => (
        <Link key={id} href={`#act-${id}`} className="rounded bg-bg px-1 text-[11px] text-brand hover:underline" title="Voir le message d'origine">
          [{index.get(id) ?? "?"}]
        </Link>
      ))}
    </span>
  );
}

/** IA-01 → IA-03 : propositions validables, annulables, origine visible. */
export function AiPanel({ contactId, suggestions, activityIndex, aiLive }: { contactId: string; suggestions: Suggestion[]; activityIndex: Map<string, number>; aiLive: boolean }) {
  const pending = suggestions.filter((s) => s.status === "pending");
  const summary = suggestions.find((s) => s.kind === "summary" && s.status !== "rejected");
  const history = suggestions.filter((s) => s.status === "accepted" && s.kind !== "summary" && s.kind !== "draft").slice(0, 5);

  return (
    <Card
      title={<span className="flex items-center gap-2">Assistant <Badge tone={aiLive ? "brand" : "neutral"}>{aiLive ? "IA" : "mode local"}</Badge></span>}
      action={
        <form action={analyzeContact.bind(null, contactId)}>
          <Button variant="secondary" className="px-2 py-1 text-xs">{summary ? "Réanalyser" : "Analyser le fil"}</Button>
        </form>
      }
    >
      {!summary && pending.length === 0 ? (
        <p className="text-sm text-muted">L&apos;assistant résume les échanges, propose les mises à jour de champs, la prochaine action et un brouillon de relance. Rien n&apos;est appliqué sans votre validation.</p>
      ) : (
        <div className="space-y-4 text-sm">
          {summary && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Résumé</p>
              <p>{String((summary.payload as { text?: string }).text ?? "")}</p>
              <ul className="mt-2 space-y-1">
                {((summary.payload as { points?: { text: string; source_ids: string[] }[] }).points ?? []).map((p, i) => (
                  <li key={i} className="text-muted">• {p.text}<Sources ids={p.source_ids} index={activityIndex} /></li>
                ))}
              </ul>
            </div>
          )}

          {pending.filter((s) => s.kind !== "summary").map((s) => {
            const p = s.payload as Record<string, string | number | null | string[]>;
            const accept = acceptSuggestion.bind(null, s.id);
            const reject = rejectSuggestion.bind(null, s.id);
            return (
              <div key={s.id} className="rounded-lg border border-line p-3">
                {s.kind === "field_update" && (
                  <form action={accept} className="space-y-2">
                    <p className="text-xs text-muted">
                      Mise à jour proposée · {s.target_type === "deal" ? "opportunité" : "contact"}<Sources ids={s.source_activity_ids} index={activityIndex} />
                    </p>
                    <p className="font-medium">{FIELD_LABELS[String(p.field)] ?? String(p.field)}</p>
                    <Input name="value" defaultValue={String(p.value ?? "")} aria-label="Valeur proposée" />
                    {p.reason && <p className="text-xs text-muted">{String(p.reason)}</p>}
                    <div className="flex gap-2"><Button className="px-2 py-1 text-xs">Valider</Button><Button formAction={reject} variant="ghost" className="px-2 py-1 text-xs">Ignorer</Button></div>
                  </form>
                )}
                {s.kind === "create_deal" && (
                  <form action={accept} className="space-y-2">
                    <p className="text-xs text-muted">Opportunité détectée<Sources ids={s.source_activity_ids} index={activityIndex} /></p>
                    <Input name="title" defaultValue={String(p.title ?? "")} aria-label="Titre" />
                    <Input name="amount" type="number" defaultValue={p.amount === null ? "" : String(p.amount)} placeholder="Montant" aria-label="Montant" />
                    <div className="flex gap-2"><Button className="px-2 py-1 text-xs">Créer l&apos;opportunité</Button><Button formAction={reject} variant="ghost" className="px-2 py-1 text-xs">Ignorer</Button></div>
                  </form>
                )}
                {s.kind === "next_action" && (
                  <form action={accept} className="space-y-2">
                    <p className="text-xs text-muted">Prochaine action<Sources ids={s.source_activity_ids} index={activityIndex} /></p>
                    <Input name="title" defaultValue={String(p.title ?? "")} aria-label="Action" />
                    <label className="flex items-center gap-2 text-xs text-muted">dans <Input name="due_in_days" type="number" min={0} defaultValue={String(p.due_in_days ?? 1)} className="w-20" /> jour(s)</label>
                    <div className="flex gap-2"><Button className="px-2 py-1 text-xs">Programmer la relance</Button><Button formAction={reject} variant="ghost" className="px-2 py-1 text-xs">Ignorer</Button></div>
                  </form>
                )}
                {s.kind === "draft" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">Brouillon de relance ({p.channel === "whatsapp" ? "WhatsApp" : "e-mail"}) — jamais envoyé sans vous</p>
                    <Textarea readOnly rows={5} defaultValue={String(p.text ?? "")} aria-label="Brouillon" />
                    <div className="flex gap-2">
                      <CopyButton text={String(p.text ?? "")} />
                      {p.channel === "whatsapp" && <Link href={`?draft=${s.id}#whatsapp`} className="rounded-lg px-2 py-1 text-xs text-brand hover:bg-bg">Utiliser dans WhatsApp</Link>}
                      <form action={reject}><Button variant="ghost" className="px-2 py-1 text-xs">Ignorer</Button></form>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {history.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Appliqué récemment</p>
              <ul className="space-y-1">
                {history.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {s.kind === "field_update" ? `${FIELD_LABELS[String(s.payload.field)] ?? s.payload.field} → ${String(s.payload.applied_value ?? s.payload.value)}` : s.kind === "create_deal" ? "Opportunité créée" : "Relance programmée"}
                    </span>
                    <form action={revertSuggestion.bind(null, s.id)}><button className="text-brand hover:underline">Annuler</button></form>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary?.model && <p className="text-[11px] text-muted">Source : {summary.model}. Les données ne servent pas à entraîner de modèle.</p>}
        </div>
      )}
    </Card>
  );
}
