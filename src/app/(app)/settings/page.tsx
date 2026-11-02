import { updateOrg, updateProfile } from "@/app/(app)/_actions/settings";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { getContext } from "@/lib/context";
import { CURRENCIES, ROLE_LABELS } from "@/lib/format";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const { supabase, org, role, user } = await getContext();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const isAdmin = role === "admin";
  return (
    <>
      <PageHeader title="Organisation" subtitle={`Votre rôle : ${ROLE_LABELS[role]}`} />
      <div className="space-y-6">
        <Card title="Entreprise">
          <form action={updateOrg} className="space-y-3">
            <fieldset disabled={!isAdmin} className="grid gap-3 sm:grid-cols-2">
              <Field label="Raison sociale"><Input name="name" defaultValue={org.name} required /></Field>
              <Field label="Devise par défaut"><Select name="default_currency" defaultValue={org.default_currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="SIREN" hint="Obligatoire pour la facturation électronique"><Input name="siren" defaultValue={org.siren ?? ""} /></Field>
              <Field label="N° TVA intracommunautaire"><Input name="vat_number" defaultValue={org.vat_number ?? ""} /></Field>
              <div className="sm:col-span-2"><Field label="Adresse"><Input name="address" defaultValue={org.address ?? ""} /></Field></div>
            </fieldset>
            {isAdmin ? <Button>Enregistrer</Button> : <p className="text-xs text-muted">Seuls les administrateurs peuvent modifier ces informations.</p>}
          </form>
        </Card>
        <Card title="Mon profil">
          <form action={updateProfile} className="flex items-end gap-2">
            <Field label="Nom affiché"><Input name="full_name" defaultValue={profile?.full_name ?? ""} /></Field>
            <Button variant="secondary">Enregistrer</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
