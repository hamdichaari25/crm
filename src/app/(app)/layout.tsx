import { redirect } from "next/navigation";
import { AppNav, MobileNav } from "@/components/nav";
import { GlobalSearch } from "@/components/global-search";
import { OfflineSync } from "@/components/offline-sync";
import { getContext } from "@/lib/context";
import { signOut } from "@/app/(auth)/actions";
import { switchOrg } from "@/app/(app)/_actions/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user, org, orgs, role } = await getContext();

  // 2FA : si un facteur TOTP est enrôlé, exiger le niveau aal2
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/auth/mfa");

  const [{ count: inbox }, { count: suggestions }, { count: tasks }] = await Promise.all([
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
    supabase.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("done_at", null).lte("due_at", new Date().toISOString()),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="px-4 py-4">
          {orgs.length > 1 ? (
            <form action={switchOrg}>
              <select name="org_id" defaultValue={org.id} className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm font-semibold" aria-label="Organisation">
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button className="mt-1 text-xs text-brand">Changer</button>
            </form>
          ) : (
            <p className="truncate font-semibold">{org.name}</p>
          )}
          <p className="text-xs text-muted">{org.plan === "trial" ? `Essai jusqu'au ${new Date(org.trial_ends_at).toLocaleDateString("fr-FR")}` : `Offre ${org.plan}`}</p>
        </div>
        <AppNav counts={{ inbox: (inbox ?? 0) + (suggestions ?? 0), tasks: tasks ?? 0 }} role={role} />
        <div className="mt-auto border-t border-line px-4 py-3 text-xs">
          <p className="truncate text-muted">{user.email}</p>
          <form action={signOut}><button className="mt-1 text-brand">Se déconnecter</button></form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur sm:px-6">
          <span className="font-semibold md:hidden">Fil</span>
          <GlobalSearch orgId={org.id} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6">{children}</main>
      </div>
      <MobileNav counts={{ inbox: (inbox ?? 0) + (suggestions ?? 0), tasks: tasks ?? 0 }} />
      <OfflineSync />
    </div>
  );
}
