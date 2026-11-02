import { Card, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";

export const metadata = { title: "Données et RGPD" };

export default async function DataPage() {
  const { role } = await getContext();
  return (
    <>
      <PageHeader title="Données et RGPD" subtitle="Vos données vous appartiennent : export complet à tout moment, sans frais." />
      <div className="space-y-6">
        <Card title="Export complet">
          <p className="mb-3 text-sm text-muted">Archive ZIP contenant un fichier CSV (UTF-8, séparateur « ; ») par type de données : contacts, entreprises, opportunités, activités, tâches, devis, factures, lignes, propositions IA, journal d&apos;audit.</p>
          {role === "admin" ? <LinkButton href="/api/export">Télécharger l&apos;export (.zip)</LinkButton> : <p className="text-sm text-muted">Réservé aux administrateurs.</p>}
        </Card>
        <Card title="Droits des personnes">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Droit d&apos;accès : la fiche contact regroupe toutes les données et tout l&apos;historique d&apos;une personne.</li>
            <li>Droit d&apos;effacement : « Supprimer le contact » efface la fiche ; ses activités sont détachées.</li>
            <li>Consentement WhatsApp horodaté sur chaque fiche.</li>
          </ul>
        </Card>
        <Card title="Hébergement et sous-traitants">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Base de données : Supabase, région Europe (Francfort, eu-central-1).</li>
            <li>Application : Vercel (fonctions exécutées en Europe, région fra1).</li>
            <li>IA (si activée) : Anthropic — pas d&apos;entraînement sur les données clients.</li>
            <li>Messagerie WhatsApp : Meta Platforms (si connectée).</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
