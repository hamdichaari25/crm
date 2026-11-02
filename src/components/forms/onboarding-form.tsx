"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/onboarding/actions";
import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createOrganization, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nom de votre entreprise"><Input name="name" required maxLength={200} placeholder="Ex. Atelier Dupont SARL" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pays">
          <Select name="country" defaultValue="FR">
            <option value="FR">France</option>
            <option value="MA">Maroc</option>
            <option value="SN">Sénégal</option>
            <option value="CI">Côte d&apos;Ivoire</option>
            <option value="BE">Belgique</option>
          </Select>
        </Field>
        <Field label="Devise">
          <Select name="currency" defaultValue="EUR">
            <option value="EUR">EUR — euro</option>
            <option value="MAD">MAD — dirham</option>
            <option value="XOF">XOF — franc CFA (UEMOA)</option>
            <option value="XAF">XAF — franc CFA (CEMAC)</option>
            <option value="DZD">DZD — dinar algérien</option>
            <option value="TND">TND — dinar tunisien</option>
          </Select>
        </Field>
      </div>
      <Field label="Modèle de pipeline">
        <Select name="template" defaultValue="b2b_services">
          <option value="b2b_services">Services B2B (lead → rendez-vous → devis → négociation)</option>
          <option value="distribution">Distribution (demande → offre tarifaire → commande)</option>
          <option value="simple">Simple (à contacter → proposition)</option>
        </Select>
      </Field>
      <ErrorNote message={state?.error} />
      <Button className="w-full" disabled={pending}>{pending ? "Création…" : "Créer mon espace"}</Button>
    </form>
  );
}
