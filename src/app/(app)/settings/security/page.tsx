import { MfaSetup } from "@/components/mfa-setup";
import { Card, PageHeader, Table } from "@/components/ui";
import { canAdmin, getContext } from "@/lib/context";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Sécurité" };

const ENT: Record<string, string> = { contacts: "Contact", companies: "Entreprise", deals: "Opportunité", quotes: "Devis", invoices: "Facture", ai_suggestions: "Proposition IA", automation_rules: "Règle", channel_connections: "Canal", memberships: "Membre" };

export default async function SecurityPage() {
  const { supabase, org, role } = await getContext();
  const { data: logs } = canAdmin(role)
    ? await supabase.from("audit_log").select("id, action, entity, entity_id, changes, created_at, actor_id").eq("org_id", org.id).order("created_at", { ascending: false }).limit(100)
    : { data: null };
  const actors = [...new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))];
  const { data: profiles } = actors.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actors as string[]) : { data: [] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));

  return (
    <>
      <PageHeader title="Sécurité" subtitle="Chiffrement en transit et au repos, rôles, double authentification, journal d'audit." />
      <div className="space-y-6">
        <Card title="Double authentification (2FA)"><MfaSetup /></Card>
        {logs && (
          <Card title="Journal d'audit (100 derniers évènements)">
            <Table head={["Date", "Auteur", "Action", "Objet", "Champs modifiés"]}>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-xs text-muted">{dateTime(l.created_at)}</td>
                  <td className="px-4 py-2 text-xs">{l.actor_id ? name.get(l.actor_id) ?? "—" : "Système"}</td>
                  <td className="px-4 py-2 text-xs">{l.action === "insert" ? "création" : l.action === "update" ? "modification" : "suppression"}</td>
                  <td className="px-4 py-2 text-xs">{ENT[l.entity] ?? l.entity}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-xs text-muted">{l.action === "update" ? Object.keys(l.changes ?? {}).join(", ") : ""}</td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
