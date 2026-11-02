"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createContact } from "@/app/(app)/_actions/contacts";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

export function NewContactForm({ defaults }: { defaults?: { email?: string; phone?: string; first_name?: string; inbox_item_id?: string } }) {
  const [state, action, pending] = useActionState(createContact, undefined);
  return (
    <form action={action} className="space-y-4">
      {defaults?.inbox_item_id && <input type="hidden" name="inbox_item_id" value={defaults.inbox_item_id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom"><Input name="first_name" defaultValue={defaults?.first_name} autoFocus /></Field>
        <Field label="Nom"><Input name="last_name" /></Field>
        <Field label="E-mail"><Input name="email" type="email" defaultValue={defaults?.email} /></Field>
        <Field label="Téléphone / WhatsApp"><Input name="phone" type="tel" defaultValue={defaults?.phone} /></Field>
        <Field label="Entreprise" hint="Créée automatiquement si elle n'existe pas"><Input name="company_name" /></Field>
        <Field label="Fonction"><Input name="job_title" /></Field>
        <Field label="Ville"><Input name="city" /></Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="whatsapp_consent" className="mt-1" />
        <span>Le contact a accepté d&apos;être contacté par WhatsApp <span className="block text-xs text-muted">Date de consentement enregistrée (RGPD, règles Meta).</span></span>
      </label>

      {state?.duplicates && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100" role="alert">
          <p className="font-medium">Ce contact existe peut-être déjà :</p>
          <ul className="mt-2 space-y-1">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/contacts/${d.id}`} className="underline">{d.name}</Link> <span className="opacity-75">{[d.email, d.phone].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <Button name="force" value="1" variant="secondary" className="mt-3" disabled={pending}>Créer quand même</Button>
        </div>
      )}
      <ErrorNote message={state?.error} />
      <Button disabled={pending}>{pending ? "Enregistrement…" : "Créer le contact"}</Button>
    </form>
  );
}
