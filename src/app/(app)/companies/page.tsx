import Link from "next/link";
import { Empty, Input, LinkButton, PageHeader, Table } from "@/components/ui";
import { getContext } from "@/lib/context";
import { relative } from "@/lib/format";

export const metadata = { title: "Entreprises" };

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const { supabase, org } = await getContext();
  let query = supabase.from("companies").select("id, name, city, domain, sector, updated_at, contacts(count)", { count: "exact" }).eq("org_id", org.id).order("name").limit(200);
  if (q) query = query.like("search_text", `%${q.toLowerCase().replace(/[%_]/g, "")}%`);
  const { data, count } = await query;
  return (
    <>
      <PageHeader title="Entreprises" subtitle={`${count ?? 0} entreprise(s)`} actions={<LinkButton href="/companies/new">Nouvelle entreprise</LinkButton>} />
      <form className="mb-4 max-w-md"><Input name="q" defaultValue={q} placeholder="Filtrer…" /></form>
      {(data ?? []).length === 0 ? (
        <Empty title="Aucune entreprise" />
      ) : (
        <Table head={["Nom", "Ville", "Secteur", "Contacts", "Mise à jour"]}>
          {(data ?? []).map((c) => (
            <tr key={c.id} className="hover:bg-bg">
              <td className="px-4 py-2.5"><Link className="font-medium hover:underline" href={`/companies/${c.id}`}>{c.name}</Link>{c.domain && <span className="block text-xs text-muted">{c.domain}</span>}</td>
              <td className="px-4 py-2.5 text-muted">{c.city ?? "—"}</td>
              <td className="px-4 py-2.5 text-muted">{c.sector ?? "—"}</td>
              <td className="px-4 py-2.5 tabular-nums">{(c.contacts as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
              <td className="px-4 py-2.5 text-muted">{relative(c.updated_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
