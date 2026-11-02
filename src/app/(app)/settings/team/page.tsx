import { headers } from "next/headers";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "@/app/(app)/_actions/settings";
import { CopyButton } from "@/components/copy-button";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { canAdmin, getContext } from "@/lib/context";
import { ROLE_LABELS, date } from "@/lib/format";

export const metadata = { title: "Équipe" };

export default async function TeamPage() {
  const { supabase, org, role, user } = await getContext();
  const admin = canAdmin(role);
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("memberships").select("user_id, role, created_at, profile:profiles(full_name, email)").eq("org_id", org.id).order("created_at"),
    admin ? supabase.from("invitations").select("id, email, role, token, expires_at").eq("org_id", org.id).is("accepted_at", null) : Promise.resolve({ data: [] as { id: string; email: string; role: string; token: string; expires_at: string }[] }),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <>
      <PageHeader title="Équipe et rôles" subtitle="Pas de minimum de sièges. Facturation par utilisateur actif." />
      <div className="space-y-6">
        <Card title={`Membres · ${members?.length ?? 0}`}>
          <ul className="divide-y divide-line">
            {(members ?? []).map((m) => {
              const p = m.profile as unknown as { full_name: string | null; email: string | null } | null;
              return (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><strong>{p?.full_name ?? p?.email}</strong> <span className="text-muted">{p?.email}</span></span>
                  {admin && m.user_id !== user.id ? (
                    <span className="flex gap-2">
                      <form action={changeRole.bind(null, m.user_id)} className="flex gap-1">
                        <Select name="role" defaultValue={m.role} className="w-auto" aria-label="Rôle">{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                        <Button variant="secondary">OK</Button>
                      </form>
                      <form action={removeMember.bind(null, m.user_id)}><Button variant="ghost" className="text-danger">Retirer</Button></form>
                    </span>
                  ) : (
                    <span className="text-muted">{ROLE_LABELS[m.role]}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        {admin && (
          <Card title="Inviter">
            <form action={inviteMember} className="flex flex-wrap items-end gap-2">
              <Field label="E-mail"><Input name="email" type="email" required /></Field>
              <Field label="Rôle"><Select name="role" defaultValue="sales">{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Button>Créer l&apos;invitation</Button>
            </form>
            {(invites ?? []).length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {(invites ?? []).map((i) => {
                  const link = `${origin}/invite/${i.token}`;
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2">
                      <span>{i.email} · {ROLE_LABELS[i.role]} <span className="text-xs text-muted">expire le {date(i.expires_at)}</span></span>
                      <span className="flex gap-1"><CopyButton text={link} label="Copier le lien" /><form action={revokeInvitation.bind(null, i.id)}><Button variant="ghost" className="px-2 py-1 text-xs">Révoquer</Button></form></span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">Envoyez le lien d&apos;invitation à votre collègue ; il doit s&apos;inscrire avec l&apos;adresse invitée.</p>
          </Card>
        )}
      </div>
    </>
  );
}
