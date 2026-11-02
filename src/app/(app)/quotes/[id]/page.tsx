import Link from "next/link";
import { notFound } from "next/navigation";
import { addQuoteLine, convertQuoteToInvoice, deleteQuoteLine, setQuoteStatus, updateQuote } from "@/app/(app)/_actions/billing";
import { CustomerBlock, LinesTable, Totals } from "@/components/doc-view";
import { PrintButton } from "@/components/print-button";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { getContext } from "@/lib/context";
import { CURRENCIES, QUOTE_STATUS, date } from "@/lib/format";

export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const { supabase, org } = await getContext();
  const { data: q } = await supabase.from("quotes").select("*, deal:deals(id, title)").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!q) notFound();
  const [{ data: lines }, { data: products }, { data: invoice }, { data: orgFull }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("position"),
    supabase.from("products").select("id, name, unit_price, tax_rate").eq("org_id", org.id).eq("active", true).order("name"),
    supabase.from("invoices").select("id, number").eq("quote_id", id).maybeSingle(),
    supabase.from("organizations").select("name, siren, vat_number, address").eq("id", org.id).single(),
  ]);
  const draft = q.status === "draft";
  const deal = q.deal as { id: string; title: string } | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Devis {q.number} <Badge tone={q.status === "accepted" || q.status === "invoiced" ? "brand" : q.status === "refused" ? "danger" : "neutral"}>{QUOTE_STATUS[q.status]}</Badge></h1>
          {deal && <p className="text-sm text-muted">Opportunité : <Link className="text-brand" href={`/deals/${deal.id}`}>{deal.title}</Link></p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {draft && <form action={setQuoteStatus.bind(null, id, "sent")}><Button variant="secondary">Marquer envoyé</Button></form>}
          {(q.status === "draft" || q.status === "sent") && (
            <>
              <form action={setQuoteStatus.bind(null, id, "accepted")}><Button>Accepté par le client</Button></form>
              <form action={setQuoteStatus.bind(null, id, "refused")}><Button variant="ghost">Refusé</Button></form>
            </>
          )}
          {q.status === "accepted" && <form action={convertQuoteToInvoice.bind(null, id)}><Button>Transformer en facture</Button></form>}
          {invoice && <Link className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand" href={`/invoices/${invoice.id}`}>Facture {invoice.number} →</Link>}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap justify-between gap-6">
          <div className="text-sm">
            <p className="font-semibold">{orgFull?.name}</p>
            {orgFull?.address && <p>{orgFull.address}</p>}
            {orgFull?.siren && <p className="text-muted">SIREN {orgFull.siren}</p>}
            {orgFull?.vat_number && <p className="text-muted">TVA {orgFull.vat_number}</p>}
          </div>
          <CustomerBlock customer={q.customer as Record<string, string>} />
        </div>
        <p className="mt-6 text-sm text-muted">Devis n° {q.number} · émis le {date(q.issue_date)} · valable jusqu&apos;au {date(q.valid_until)} · {q.currency}</p>
        <div className="mt-4">
          <LinesTable
            lines={lines ?? []}
            currency={q.currency}
            onDelete={draft ? (lineId) => <form action={deleteQuoteLine.bind(null, id, lineId)}><button className="text-xs text-danger" aria-label="Supprimer la ligne">✕</button></form> : undefined}
          />
          <Totals subtotal={q.subtotal} tax={q.tax_total} total={q.total} currency={q.currency} />
        </div>
        {q.notes && <p className="mt-6 whitespace-pre-line text-sm text-muted">{q.notes}</p>}
      </Card>

      {draft && (
        <div className="grid gap-6 lg:grid-cols-2 print:hidden">
          <Card title="Ajouter une ligne">
            <form action={addQuoteLine.bind(null, id)} className="space-y-3">
              <Field label="Produit du catalogue (optionnel)">
                <Select name="product_id" defaultValue="">
                  <option value="">— Ligne libre —</option>
                  {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} — {Number(p.unit_price)} {q.currency}</option>)}
                </Select>
              </Field>
              <Field label="Désignation"><Input name="description" placeholder="Laisser vide pour reprendre le produit" /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Quantité"><Input name="quantity" type="number" step="0.001" min={0} defaultValue={1} /></Field>
                <Field label="PU HT"><Input name="unit_price" type="number" step="0.01" min={0} /></Field>
                <Field label="TVA %"><Input name="tax_rate" type="number" step="0.01" min={0} placeholder="20" /></Field>
              </div>
              <Button>Ajouter</Button>
            </form>
          </Card>
          <Card title="Conditions">
            <form action={updateQuote.bind(null, id)} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Valable jusqu'au"><Input name="valid_until" type="date" defaultValue={q.valid_until} /></Field>
                <Field label="Devise"><Select name="currency" defaultValue={q.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              </div>
              <Field label="Notes et conditions de paiement"><Textarea name="notes" rows={4} defaultValue={q.notes ?? ""} placeholder="Ex. Paiement à 30 jours. Pénalités de retard : 3 fois le taux d'intérêt légal." /></Field>
              <Button variant="secondary">Enregistrer</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
