import Link from "next/link";
import { notFound } from "next/navigation";
import { issueInvoice, markInvoicePaid, simulateInvoiceStatus, transmitInvoice } from "@/app/(app)/_actions/billing";
import { CustomerBlock, LinesTable, Totals } from "@/components/doc-view";
import { PrintButton } from "@/components/print-button";
import { Badge, Button, Card } from "@/components/ui";
import { getContext } from "@/lib/context";
import { INVOICE_STATUS, date, dateTime } from "@/lib/format";

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const { supabase, org, role } = await getContext();
  const { data: inv } = await supabase.from("invoices").select("*, quote:quotes(id, number)").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!inv) notFound();
  const [{ data: lines }, { data: events }, { data: orgFull }] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("position"),
    supabase.from("invoice_events").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    supabase.from("organizations").select("name, siren, vat_number, address").eq("id", org.id).single(),
  ]);
  const quote = inv.quote as { id: string; number: string } | null;
  const canIssue = ["admin", "finance", "manager"].includes(role);
  const sandbox = !inv.platform || inv.platform === "sandbox";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Facture {inv.number} <Badge tone={inv.status === "paid" ? "brand" : inv.status === "rejected" ? "danger" : "warn"}>{INVOICE_STATUS[inv.status]}</Badge></h1>
          {quote && <p className="text-sm text-muted">Issue du devis <Link className="text-brand" href={`/quotes/${quote.id}`}>{quote.number}</Link></p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {inv.status === "draft" && canIssue && <form action={issueInvoice.bind(null, id)}><Button>Contrôler et émettre</Button></form>}
          {["issued", "rejected"].includes(inv.status) && <form action={transmitInvoice.bind(null, id)}><Button>Transmettre à la plateforme agréée</Button></form>}
          {["issued", "transmitted", "delivered"].includes(inv.status) && <form action={markInvoicePaid.bind(null, id)}><Button variant="secondary">Marquer payée</Button></form>}
        </div>
      </div>
      {inv.status === "draft" && <p className="rounded-lg border border-line bg-panel p-3 text-sm text-muted print:hidden">Brouillon : vérifiez les informations. Une fois émise, la facture devient non modifiable (numérotation continue, intégrité).</p>}

      <Card>
        <div className="flex flex-wrap justify-between gap-6">
          <div className="text-sm">
            <p className="font-semibold">{orgFull?.name}</p>
            {orgFull?.address && <p>{orgFull.address}</p>}
            {orgFull?.siren ? <p className="text-muted">SIREN {orgFull.siren}</p> : <p className="text-warn print:hidden">SIREN manquant — <Link className="underline" href="/settings">compléter</Link></p>}
            {orgFull?.vat_number && <p className="text-muted">TVA {orgFull.vat_number}</p>}
          </div>
          <CustomerBlock customer={inv.customer as Record<string, string>} />
        </div>
        <p className="mt-6 text-sm text-muted">Facture n° {inv.number} · émise le {date(inv.issue_date)} · échéance {date(inv.due_date)} · {inv.currency}</p>
        <div className="mt-4">
          <LinesTable lines={lines ?? []} currency={inv.currency} />
          <Totals subtotal={inv.subtotal} tax={inv.tax_total} total={inv.total} currency={inv.currency} />
        </div>
        {inv.notes && <p className="mt-6 whitespace-pre-line text-sm text-muted">{inv.notes}</p>}
      </Card>

      <Card title="Suivi plateforme agréée" className="print:hidden" action={inv.platform_ref && <span className="text-xs text-muted">Réf. {inv.platform_ref}</span>}>
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-muted">Pas encore transmise.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex gap-3"><span className="w-32 shrink-0 text-xs text-muted">{dateTime(e.created_at)}</span><span><strong>{e.status}</strong> {e.message && <span className="text-muted">— {e.message}</span>}</span></li>
            ))}
          </ol>
        )}
        {sandbox && ["transmitted", "delivered"].includes(inv.status) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <span className="text-xs text-muted">Bac à sable — simuler un retour :</span>
            <form action={simulateInvoiceStatus.bind(null, id, "delivered")}><Button variant="ghost" className="px-2 py-1 text-xs">Reçue</Button></form>
            <form action={simulateInvoiceStatus.bind(null, id, "paid")}><Button variant="ghost" className="px-2 py-1 text-xs">Payée</Button></form>
            <form action={simulateInvoiceStatus.bind(null, id, "rejected")}><Button variant="ghost" className="px-2 py-1 text-xs">Rejetée</Button></form>
          </div>
        )}
      </Card>
    </div>
  );
}
