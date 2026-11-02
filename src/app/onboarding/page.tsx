import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bienvenue" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/onboarding");
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-sm font-medium text-brand">Étape 1 sur 3</p>
      <h1 className="mt-1 text-2xl font-semibold">Créons votre espace</h1>
      <p className="mt-2 mb-6 text-sm text-muted">Ensuite : importez votre fichier clients, puis invitez votre équipe.</p>
      <div className="rounded-2xl border border-line bg-panel p-6"><OnboardingForm /></div>
    </main>
  );
}
