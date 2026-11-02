import { acceptInvitation } from "@/app/onboarding/actions";
import { Button, ErrorNote, LinkButton } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const next = `/invite/${token}`;

  return (
    <main className="mx-auto max-w-sm px-4 py-20">
      <div className="space-y-4 rounded-2xl border border-line bg-panel p-6">
        <h1 className="text-lg font-semibold">Rejoindre l&apos;équipe</h1>
        <ErrorNote message={typeof error === "string" ? error : null} />
        {data.user ? (
          <form action={acceptInvitation.bind(null, token)}>
            <p className="mb-4 text-sm text-muted">Connecté en tant que {data.user.email}.</p>
            <Button className="w-full">Accepter l&apos;invitation</Button>
          </form>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted">Créez votre compte avec l&apos;adresse invitée, ou connectez-vous.</p>
            <LinkButton className="w-full" href={`/signup?next=${encodeURIComponent(next)}`}>Créer mon compte</LinkButton>
            <LinkButton className="w-full" variant="secondary" href={`/login?next=${encodeURIComponent(next)}`}>Se connecter</LinkButton>
          </div>
        )}
      </div>
    </main>
  );
}
