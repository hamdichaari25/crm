import Link from "next/link";
import { mergeContacts } from "@/app/(app)/_actions/contacts";
import { Button, Card, Empty, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { fullName, relative } from "@/lib/format";

export const metadata = { title: "Doublons" };

type C = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; created_at: string; last_activity_at: string | null };

export default async function DuplicatesPage() {
  const { supabase, org } = await getContext();
  const { data: pairs } = await supabase.rpc("list_duplicate_pairs", { p_org: org.id });
  const ids = [...new Set((pairs ?? []).flatMap((p: { a: string; b: string }) => [p.a, p.b]))];
  const { data: contacts } = ids.length
    ? await supabase.from("contacts").select("id, first_name, last_name, email, phone, created_at, last_activity_at").in("id", ids)
    : { data: [] as C[] };
  const byId = new Map((contacts ?? []).map((c) => [c.id, c as C]));

  return (
    <>
      <PageHeader title="Doublons" subtitle="Fiches partageant le même e-mail ou téléphone. La fusion conserve tout l'historique." />
      {(pairs ?? []).length === 0 ? (
        <Empty title="Aucun doublon détecté 👍" />
      ) : (
        <div className="space-y-3">
          {(pairs as { a: string; b: string; reason: string }[]).map((p) => {
            const a = byId.get(p.a);
            const b = byId.get(p.b);
            if (!a || !b) return null;
            return (
              <Card key={p.a + p.b} title={`Même ${p.reason}`}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[a, b].map((c, i) => {
                    const other = i === 0 ? b : a;
                    return (
                      <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
                        <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{fullName(c)}</Link>
                        <p className="text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                        <p className="text-xs text-muted">Créé {relative(c.created_at)} · dernier échange {relative(c.last_activity_at)}</p>
                        <form action={mergeContacts.bind(null, c.id, other.id)} className="mt-2">
                          <Button variant="secondary">Conserver cette fiche et fusionner</Button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
