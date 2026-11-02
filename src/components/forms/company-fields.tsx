import { Field, Input } from "@/components/ui";

type Co = { name?: string; domain?: string | null; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; country?: string | null; siren?: string | null; vat_number?: string | null; sector?: string | null };

export function CompanyFields({ c = {} }: { c?: Co }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Raison sociale"><Input name="name" required defaultValue={c.name ?? ""} /></Field>
      <Field label="Site / domaine"><Input name="domain" defaultValue={c.domain ?? ""} /></Field>
      <Field label="Téléphone"><Input name="phone" defaultValue={c.phone ?? ""} /></Field>
      <Field label="E-mail"><Input name="email" type="email" defaultValue={c.email ?? ""} /></Field>
      <Field label="Adresse"><Input name="address" defaultValue={c.address ?? ""} /></Field>
      <Field label="Ville"><Input name="city" defaultValue={c.city ?? ""} /></Field>
      <Field label="Pays"><Input name="country" defaultValue={c.country ?? ""} /></Field>
      <Field label="Secteur"><Input name="sector" defaultValue={c.sector ?? ""} /></Field>
      <Field label="SIREN" hint="Requis pour la facture électronique"><Input name="siren" defaultValue={c.siren ?? ""} inputMode="numeric" /></Field>
      <Field label="N° TVA intracommunautaire"><Input name="vat_number" defaultValue={c.vat_number ?? ""} /></Field>
    </div>
  );
}
