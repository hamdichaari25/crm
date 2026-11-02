import Link from "next/link";
import { Badge, Empty, Input, PageHeader, Table } from "@/components/ui";
import { getContext } from "@/lib/context";
import { INVOICE_STATUS, date, money } from "@/lib/format";

export const metadata = { title: "Factures" };

export default async function InvoicesPage() {
  const { supabase, org } = await getContext();
  const { data } = await supabase.from("invoices").select("id, number, status, total, currency, issue_date, due_date, customer, platform_status").eq("org_id", org.id).order("created_at", { ascending: false }).limit(300);
  const year = new Date().getFullYear();
  return (
    <>
      <PageHeader
        title="Factures"
        subtitle="Transmission à la plateforme agréée et suivi du statut."
        actions={
          <form action="/api/accounting-export" className="flex items-end gap-2">
            <Input type="date" name="from" defaultValue={`${year}-01-01`} className="w-auto" aria-label="Du" />
            <Input type="date" name="to" defaultValue={`${year}-12-31`} className="w-auto" aria-label="Au" />
            <button className="rounded-lg border border-line bg-panel px-3 py-2 text-sm">Export comptable (CSV)</button>
          </form>
        }
      />
      {(data ?? []).length === 0 ? (
        <Empty title="Aucune facture">Les factures se créent depuis un devis accepté.</Empty>
      ) : (
        <Table head={["Numéro", "Client", "Émise le", "Échéance", "Montant TTC", "Statut"]}>
          {(data ?? []).map((i) => {
            const c = i.customer as Record<string, string>;
            const late = i.status !== "paid" && i.status !== "draft" && new Date(i.due_date) < new Date();
            return (
              <tr key={i.id} className="hover:bg-bg">
                <td className="px-4 py-2.5"><Link className="font-medium hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></td>
                <td className="px-4 py-2.5">{c.company_name ?? c.contact_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">{date(i.issue_date)}</td>
                <td className={`px-4 py-2.5 ${late ? "text-danger" : "text-muted"}`}>{date(i.due_date)}</td>
                <td className="px-4 py-2.5 tabular-nums">{money(i.total, i.currency)}</td>
                <td className="px-4 py-2.5"><Badge tone={i.status === "paid" ? "brand" : i.status === "rejected" ? "danger" : i.status === "draft" ? "neutral" : "warn"}>{INVOICE_STATUS[i.status]}</Badge></td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
