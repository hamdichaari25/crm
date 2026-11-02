import { LinkButton } from "@/components/ui";

const features = [
  ["Un fil unique par client", "E-mails, WhatsApp, appels et rendez-vous réunis sur la même fiche, sans ressaisie."],
  ["Une IA qui propose, vous validez", "Résumés cités, champs préremplis, prochaine action et brouillon de relance — rien ne part sans vous."],
  ["Du devis à la facture", "Devis depuis l'opportunité, facture sans ressaisie, transmission à une plateforme agréée."],
  ["Prêt en 15 minutes", "Import Excel guidé avec détection des doublons, modèle de pipeline, invitation de l'équipe."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-ink">≡</span> Fil
        </span>
        <div className="flex gap-2">
          <LinkButton href="/login" variant="ghost">Connexion</LinkButton>
          <LinkButton href="/signup">Essai gratuit</LinkButton>
        </div>
      </nav>
      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Le CRM qui se remplit tout seul.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Pour les PME qui vendent par e-mail, téléphone et WhatsApp, et facturent en conformité.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <LinkButton href="/signup" className="px-5 py-3 text-base">Démarrer l&apos;essai de 14 jours</LinkButton>
        </div>
        <p className="mt-3 text-sm text-muted">Essentiel 19 € · Pro 29 € HT / utilisateur / mois · IA incluse · sans engagement</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {features.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-line bg-panel p-5">
            <h2 className="font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
      <footer className="mt-16 text-center text-xs text-muted">Données hébergées dans l&apos;Union européenne · Export complet à tout moment, sans frais</footer>
    </main>
  );
}
