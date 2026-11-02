import { createProduct } from "@/app/(app)/_actions/billing";
import { Button, Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { getContext } from "@/lib/context";
import { CURRENCIES, money } from "@/lib/format";

export const metadata = { title: "Catalogue" };

export default async function ProductsPage() {
  const { supabase, org } = await getContext();
  const { data } = await supabase.from("products").select("*").eq("org_id", org.id).order("name");
  return (
    <>
      <PageHeader title="Catalogue produits et services" />
      <Table head={["Nom", "Prix HT", "TVA"]}>
        {(data ?? []).map((p) => (
          <tr key={p.id}><td className="px-4 py-2">{p.name}</td><td className="px-4 py-2 tabular-nums">{money(p.unit_price, p.currency)}</td><td className="px-4 py-2">{Number(p.tax_rate)} %</td></tr>
        ))}
      </Table>
      <Card title="Ajouter" className="mt-6">
        <form action={createProduct} className="flex flex-wrap items-end gap-2">
          <Field label="Nom"><Input name="name" required /></Field>
          <Field label="Prix HT"><Input name="unit_price" type="number" step="0.01" min={0} required /></Field>
          <Field label="TVA %"><Input name="tax_rate" type="number" step="0.01" defaultValue={20} className="w-24" /></Field>
          <Field label="Devise"><Select name="currency" defaultValue={org.default_currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Button>Ajouter</Button>
        </form>
      </Card>
    </>
  );
}
