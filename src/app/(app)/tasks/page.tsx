import Link from "next/link";
import { createTask, toggleTask } from "@/app/(app)/_actions/tasks";
import { Badge, Button, Card, Empty, Input, PageHeader, cx } from "@/components/ui";
import { getContext } from "@/lib/context";
import { fullName, nowMs, relative } from "@/lib/format";

export const metadata = { title: "Relances & tâches" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : sp.scope === "done" ? "done" : "mine";
  const { supabase, org, user } = await getContext();
  let q = supabase
    .from("tasks")
    .select("id, title, due_at, done_at, source, contact:contacts(id, first_name, last_name, email), deal:deals(id, title)")
    .eq("org_id", org.id)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (scope === "done") q = q.not("done_at", "is", null).order("done_at", { ascending: false });
  else q = q.is("done_at", null);
  if (scope === "mine") q = q.eq("assignee_id", user.id);
  const { data } = await q;
  const now = nowMs();
  const groups = {
    "En retard": (data ?? []).filter((t) => !t.done_at && t.due_at && new Date(t.due_at).getTime() < now),
    "À venir": (data ?? []).filter((t) => t.done_at || !t.due_at || new Date(t.due_at).getTime() >= now),
  };

  return (
    <>
      <PageHeader title="Relances & tâches" subtitle="Les règles d'automatisation et l'assistant créent les relances pour vous." />
      <nav className="mb-4 flex gap-1 text-sm">
        {[["mine", "Mes tâches"], ["all", "Toute l'équipe"], ["done", "Terminées"]].map(([k, l]) => (
          <Link key={k} href={`?scope=${k}`} className={cx("rounded-lg px-3 py-1.5", scope === k ? "bg-brand-soft font-medium text-brand" : "text-muted")}>{l}</Link>
        ))}
      </nav>
      <Card className="mb-6">
        <form action={createTask} className="flex flex-wrap gap-2">
          <Input name="title" placeholder="Nouvelle tâche…" required className="min-w-60 flex-1" />
          <Input name="due_at" type="datetime-local" className="w-auto" aria-label="Échéance" />
          <Button>Ajouter</Button>
        </form>
      </Card>
      {(data ?? []).length === 0 ? (
        <Empty title="Aucune tâche" />
      ) : (
        Object.entries(groups).map(([label, list]) =>
          list.length === 0 ? null : (
            <section key={label} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-muted">{label} · {list.length}</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
                {list.map((t) => {
                  const c = t.contact as unknown as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
                  const d = t.deal as unknown as { id: string; title: string } | null;
                  return (
                    <li key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                      <form action={toggleTask.bind(null, t.id, !t.done_at)}>
                        <button aria-label={t.done_at ? "Rouvrir" : "Terminer"} className={`mt-0.5 h-4 w-4 rounded border ${t.done_at ? "border-brand bg-brand" : "border-line"}`} />
                      </form>
                      <div className="min-w-0 flex-1">
                        <p className={t.done_at ? "text-muted line-through" : "font-medium"}>{t.title}</p>
                        <p className="text-xs text-muted">
                          {c && <Link className="text-brand" href={`/contacts/${c.id}`}>{fullName(c)}</Link>}
                          {d && <> · <Link className="text-brand" href={`/deals/${d.id}`}>{d.title}</Link></>}
                        </p>
                      </div>
                      {t.source !== "manual" && <Badge tone="brand">{t.source === "rule" ? "Règle" : "IA"}</Badge>}
                      <Badge tone={label === "En retard" ? "danger" : "neutral"}>{t.due_at ? relative(t.due_at) : "—"}</Badge>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )
      )}
    </>
  );
}
