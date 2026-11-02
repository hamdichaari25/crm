import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "manager" | "sales" | "finance";

export type Org = {
  id: string;
  name: string;
  country: string;
  default_currency: string;
  siren: string | null;
  vat_number: string | null;
  address: string | null;
  plan: string;
  trial_ends_at: string;
};

export const ORG_COLUMNS = "id, name, country, default_currency, siren, vat_number, address, plan, trial_ends_at";

/** Utilisateur connecté, organisation active et rôle. Redirige si nécessaire. */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select(`role, org:organizations(${ORG_COLUMNS})`)
    .eq("user_id", auth.user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const wanted = (await cookies()).get("org_id")?.value;
  const current = memberships.find((m) => (m.org as unknown as Org)?.id === wanted) ?? memberships[0];

  return {
    supabase,
    user: auth.user,
    org: current.org as unknown as Org,
    role: current.role as Role,
    orgs: memberships.map((m) => m.org as unknown as Org),
  };
});

export function canAdmin(role: Role) {
  return role === "admin" || role === "manager";
}
