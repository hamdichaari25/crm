import { headers } from "next/headers";
import { saveChannel } from "@/app/(app)/_actions/settings";
import { CopyButton } from "@/components/copy-button";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { canAdmin, getContext } from "@/lib/context";
import { listEInvoiceProviders } from "@/lib/einvoice";
import { aiEnabled } from "@/lib/ai/analyze";

export const metadata = { title: "Canaux" };

function Status({ s }: { s?: string }) {
  return s === "connected" ? <Badge tone="brand">connecté</Badge> : <Badge>non connecté</Badge>;
}

function Url({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-bg px-2 py-1">{url}</code>
      <CopyButton text={url} />
    </div>
  );
}

export default async function ChannelsPage() {
  const { supabase, org, role } = await getContext();
  const admin = canAdmin(role);
  const { data: conns } = await supabase.from("channel_connections").select("provider, status, config").eq("org_id", org.id);
  const by = new Map((conns ?? []).map((c) => [c.provider, c]));
  const { data: secret } = role === "admin" ? await supabase.rpc("get_inbound_secret", { p_org: org.id }) : { data: null };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const sec = secret ? String(secret) : "•••• (visible par un administrateur)";

  return (
    <>
      <PageHeader title="Canaux et intégrations" subtitle="Chaque message capturé est rattaché automatiquement au bon contact, sans saisie." />
      <div className="space-y-6">
        <Card title={<span className="flex items-center gap-2">WhatsApp Business (API officielle Meta) <Status s={by.get("whatsapp")?.status} /></span>}>
          <div className="space-y-3 text-sm">
            <p className="text-muted">Créez une application Meta, associez votre numéro WhatsApp Business, puis renseignez ci-dessous l&apos;identifiant du numéro. Le jeton d&apos;accès est stocké côté serveur (variable <code>WHATSAPP_ACCESS_TOKEN</code>), jamais dans la base.</p>
            <Url label="URL de rappel" url={`${origin}/api/webhooks/whatsapp/${org.id}?k=${secret ?? "<secret>"}`} />
            <Url label="Jeton de vérif." url={sec} />
            {admin && (
              <form action={saveChannel.bind(null, "whatsapp")} className="flex flex-wrap items-end gap-2">
                <Field label="Phone number ID"><Input name="config.phone_number_id" defaultValue={by.get("whatsapp")?.config?.phone_number_id ?? ""} /></Field>
                <Field label="Numéro affiché"><Input name="config.display_number" defaultValue={by.get("whatsapp")?.config?.display_number ?? ""} placeholder="+33 6 …" /></Field>
                <Button variant="secondary">Enregistrer</Button>
              </form>
            )}
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2">E-mail et calendrier (Gmail, Microsoft 365) <Status s={by.get("gmail")?.status ?? by.get("microsoft365")?.status} /></span>}>
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              La synchronisation native OAuth (Google, Microsoft) demande une validation d&apos;application par chaque éditeur. En attendant, tout outil capable d&apos;appeler un webhook (règle de transfert, Make, n8n, Zapier, Power Automate) peut pousser e-mails et rendez-vous :
            </p>
            <Url label="Webhook" url={`${origin}/api/inbound/${org.id}`} />
            <Url label="En-tête" url={`x-fil-secret: ${sec}`} />
            <pre className="overflow-x-auto rounded-lg bg-bg p-3 text-xs">{`POST /api/inbound/${org.id}
{ "channel": "email", "direction": "inbound",
  "from": "client@exemple.fr", "to": "vous@entreprise.fr",
  "subject": "Demande de devis", "body": "…",
  "occurred_at": "2026-11-02T09:30:00Z", "external_id": "<message-id>" }`}</pre>
            <p className="text-xs text-muted">Canaux acceptés : email, whatsapp, call (avec duration_seconds), meeting. Un expéditeur inconnu arrive dans « À traiter ».</p>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2">Téléphonie (Aircall, Ringover) <Status s={by.get("telephony")?.status} /></span>}>
          <p className="text-sm text-muted">Le bouton « Appeler » ouvre votre application téléphonique (click-to-call). Pour journaliser les appels automatiquement avec leur durée, configurez le webhook ci-dessus avec <code>&quot;channel&quot;: &quot;call&quot;</code>.</p>
        </Card>

        <Card title={<span className="flex items-center gap-2">Plateforme agréée (facture électronique) <Status s={by.get("einvoice")?.status} /></span>}>
          <div className="space-y-3 text-sm">
            <p className="text-muted">Les factures émises sont transmises à la plateforme partenaire ; leurs statuts remontent sur la fiche client.</p>
            <Url label="Webhook statut" url={`${origin}/api/einvoice/${org.id}`} />
            {admin && (
              <form action={saveChannel.bind(null, "einvoice")} className="flex flex-wrap items-end gap-2">
                <Field label="Connecteur">
                  <Select name="config.provider" defaultValue={by.get("einvoice")?.config?.provider ?? "sandbox"}>
                    {listEInvoiceProviders().map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </Select>
                </Field>
                <Button variant="secondary">Enregistrer</Button>
              </form>
            )}
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2">Assistant IA {aiEnabled() ? <Badge tone="brand">actif</Badge> : <Badge>mode local</Badge>}</span>}>
          <p className="text-sm text-muted">
            {aiEnabled()
              ? "Résumés, extraction et rédaction par Claude (Anthropic). Les données ne servent pas à entraîner les modèles."
              : "Ajoutez la variable ANTHROPIC_API_KEY sur le serveur pour activer l'IA. En attendant, un moteur local fournit des résumés extractifs et des relances types."}
          </p>
        </Card>
      </div>
    </>
  );
}
