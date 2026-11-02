"use client";

import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-panel p-6 text-center">
      <h1 className="font-semibold">Une erreur est survenue</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "Erreur inattendue."}</p>
      <Button className="mt-4" onClick={reset}>Réessayer</Button>
    </div>
  );
}
