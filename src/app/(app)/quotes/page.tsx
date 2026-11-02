import Link from "next/link";
import { Badge, Empty, PageHeader, Table } from "@/components/ui";
import { getContext } from "@/lib/context";
import { QUOTE_STATUS, date, money } from "@/lib/format";

export const metadata = { title: "Devis" };

export default async function QuotesPage() {
  const { supabase, org } = await getContext();
  const { data } = await supabase.from("quotes").select("id, number, status, total, currency, issue_date, valid_until, customer, deal:deals(id, title)").eq("org_id", org.id).order("created_at", { ascending: false }).limit(300);
  return (
    <>
      <PageHeader title="Devis" subtitle="Créez un devis depuis une opportunité : les données client sont reprises sans ressaisie." />
      {(data ?? []).length === 0 ? (
        <Empty title="Aucun devis"><Link className="text-brand underline" href="/pipeline">Ouvrir le pipeline</Link></Empty>
      ) : (
        <Table head={["Numéro", "Client", "Opportunité", "Date", "Montant TTC", "Statut"]}>
          {(data ?? []).map((q) => {
            const c = q.customer as Record<string, string>;
            const d = q.deal as unknown as { id: string; title: string } | null;
            return (
              <tr key={q.id} className="hover:bg-bg">
                <td className="px-4 py-2.5"><Link className="font-medium hover:underline" href={`/quotes/${q.id}`}>{q.number}</Link></td>
                <td className="px-4 py-2.5">{c.company_name ?? c.contact_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">{d ? <Link href={`/deals/${d.id}`}>{d.title}</Link> : "—"}</td>
                <td className="px-4 py-2.5 text-muted">{date(q.issue_date)}</td>
                <td className="px-4 py-2.5 tabular-nums">{money(q.total, q.currency)}</td>
                <td className="px-4 py-2.5"><Badge tone={q.status === "accepted" || q.status === "invoiced" ? "brand" : q.status === "refused" ? "danger" : "neutral"}>{QUOTE_STATUS[q.status]}</Badge></td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
