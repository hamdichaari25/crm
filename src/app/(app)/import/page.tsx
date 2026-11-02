import { ImportWizard } from "@/components/import-wizard";
import { PageHeader, Table } from "@/components/ui";
import { getContext } from "@/lib/context";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Importer" };

export default async function ImportPage() {
  const { supabase, org } = await getContext();
  const { data: jobs } = await supabase.from("import_jobs").select("id, filename, total_rows, inserted, duplicates, failed, created_at").eq("org_id", org.id).order("created_at", { ascending: false }).limit(10);
  return (
    <>
      <PageHeader title="Importer vos contacts" subtitle="Depuis Excel ou CSV : correspondance des colonnes, détection des doublons, rapport d'erreurs." />
      <ImportWizard />
      {(jobs ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Imports précédents</h2>
          <Table head={["Fichier", "Date", "Lignes", "Créés", "Doublons", "Erreurs"]}>
            {(jobs ?? []).map((j) => (
              <tr key={j.id}>
                <td className="px-4 py-2">{j.filename}</td>
                <td className="px-4 py-2 text-muted">{dateTime(j.created_at)}</td>
                <td className="px-4 py-2 tabular-nums">{j.total_rows}</td>
                <td className="px-4 py-2 tabular-nums">{j.inserted}</td>
                <td className="px-4 py-2 tabular-nums">{j.duplicates}</td>
                <td className="px-4 py-2 tabular-nums">{j.failed}</td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </>
  );
}
