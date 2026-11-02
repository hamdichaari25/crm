import Link from "next/link";
import { Badge, Empty, Input, LinkButton, PageHeader, Table } from "@/components/ui";
import { getContext } from "@/lib/context";
import { fullName, relative } from "@/lib/format";

export const metadata = { title: "Contacts" };
const PAGE = 50;

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const { supabase, org } = await getContext();

  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, job_title, source, last_activity_at, company:companies(id, name)", { count: "exact" })
    .eq("org_id", org.id)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.like("search_text", `%${q.toLowerCase().replace(/[%_]/g, "")}%`);
  const { data, count } = await query;
  const pages = Math.ceil((count ?? 0) / PAGE);

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={`${count ?? 0} contact(s)`}
        actions={
          <>
            <LinkButton href="/contacts/duplicates" variant="secondary">Doublons</LinkButton>
            <LinkButton href="/import" variant="secondary">Importer</LinkButton>
            <LinkButton href="/contacts/new">Nouveau contact</LinkButton>
          </>
        }
      />
      <form className="mb-4 max-w-md"><Input name="q" defaultValue={q} placeholder="Filtrer par nom, e-mail, téléphone…" /></form>
      {(data ?? []).length === 0 ? (
        <Empty title={q ? "Aucun résultat" : "Aucun contact pour l'instant"}>
          {!q && <>Importez votre fichier Excel ou créez un premier contact. <Link className="text-brand underline" href="/import">Importer</Link></>}
        </Empty>
      ) : (
        <Table head={["Nom", "Entreprise", "E-mail", "Téléphone", "Dernier échange"]}>
          {(data ?? []).map((c) => {
            const co = c.company as unknown as { id: string; name: string } | null;
            return (
              <tr key={c.id} className="hover:bg-bg">
                <td className="px-4 py-2.5">
                  <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{fullName(c)}</Link>
                  {c.job_title && <span className="block text-xs text-muted">{c.job_title}</span>}
                </td>
                <td className="px-4 py-2.5">{co ? <Link href={`/companies/${co.id}`} className="hover:underline">{co.name}</Link> : "—"}</td>
                <td className="px-4 py-2.5 text-muted">{c.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">{c.phone ?? "—"}</td>
                <td className="px-4 py-2.5">{c.last_activity_at ? relative(c.last_activity_at) : <Badge>{c.source === "import" ? "Importé" : "Aucun"}</Badge>}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {pages > 1 && (
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Pagination">
          {page > 1 && <Link className="text-brand" href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>← Précédent</Link>}
          <span className="text-muted">Page {page} / {pages}</span>
          {page < pages && <Link className="text-brand" href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>Suivant →</Link>}
        </nav>
      )}
    </>
  );
}
