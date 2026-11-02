import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCompany } from "@/app/(app)/_actions/contacts";
import { CompanyFields } from "@/components/forms/company-fields";
import { Timeline, type Activity } from "@/components/timeline";
import { Badge, Button, Card, LinkButton } from "@/components/ui";
import { getContext } from "@/lib/context";
import { INVOICE_STATUS, QUOTE_STATUS, fullName, money } from "@/lib/format";

export default async function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params;
  const { supabase, org } = await getContext();
  const { data: co } = await supabase.from("companies").select("*").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!co) notFound();
  const [{ data: contacts }, { data: acts }, { data: deals }, { data: quotes }, { data: invoices }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, email, phone, job_title").eq("company_id", id),
    supabase.from("activities").select("id, type, direction, subject, body, occurred_at, source, duration_seconds, meta, contact:contacts(id, first_name, last_name)").eq("company_id", id).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("deals").select("id, title, amount, currency, status").eq("company_id", id),
    supabase.from("quotes").select("id, number, status, total, currency").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, number, status, total, currency, platform_status").eq("company_id", id).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{co.name}</h1>
            <p className="text-sm text-muted">{[co.sector, co.city, co.domain].filter(Boolean).join(" · ")}</p>
          </div>
          <LinkButton href={`/contacts/new`} variant="secondary">+ Contact</LinkButton>
        </div>
        <Card title="Fil de l'entreprise (tous contacts)">
          <Timeline items={(acts ?? []) as unknown as Activity[]} showContact />
        </Card>
      </div>
      <aside className="space-y-6">
        <Card title="Contacts">
          <ul className="space-y-2 text-sm">
            {(contacts ?? []).map((c) => (
              <li key={c.id}><Link className="font-medium hover:underline" href={`/contacts/${c.id}`}>{fullName(c)}</Link> <span className="text-xs text-muted">{c.job_title}</span></li>
            ))}
            {(contacts ?? []).length === 0 && <li className="text-muted">Aucun contact.</li>}
          </ul>
        </Card>
        <Card title="Opportunités, devis et factures">
          <ul className="space-y-1.5 text-sm">
            {(deals ?? []).map((d) => <li key={d.id} className="flex justify-between"><Link className="hover:underline" href={`/deals/${d.id}`}>{d.title}</Link><span className="tabular-nums">{money(d.amount, d.currency)}</span></li>)}
            {(quotes ?? []).map((q) => <li key={q.id} className="flex justify-between"><Link className="hover:underline" href={`/quotes/${q.id}`}>{q.number}</Link><Badge>{QUOTE_STATUS[q.status]}</Badge></li>)}
            {(invoices ?? []).map((i) => <li key={i.id} className="flex justify-between"><Link className="hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link><Badge tone={i.status === "paid" ? "brand" : i.status === "rejected" ? "danger" : "neutral"}>{INVOICE_STATUS[i.status]}</Badge></li>)}
          </ul>
        </Card>
        <Card title="Informations">
          <form action={updateCompany.bind(null, id)} className="space-y-3">
            <CompanyFields c={co} />
            <Button className="w-full">Enregistrer</Button>
          </form>
        </Card>
      </aside>
    </div>
  );
}
