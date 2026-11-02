import { MfaForm } from "@/components/forms/auth-forms";

export default async function MfaPage({ searchParams }: PageProps<"/auth/mfa">) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6">
        <MfaForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
