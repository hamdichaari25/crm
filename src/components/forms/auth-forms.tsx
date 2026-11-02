"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, verifyMfa } from "@/app/(auth)/actions";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Connexion</h1>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="E-mail professionnel"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Field label="Mot de passe"><Input name="password" type="password" required autoComplete="current-password" /></Field>
      <ErrorNote message={state?.error} />
      <Button className="w-full" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</Button>
      <p className="text-center text-sm text-muted">
        Pas encore de compte ? <Link className="text-brand underline" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Essai gratuit 14 jours</Link>
      </p>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.info) return <p className="text-sm">{state.info}</p>;
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Créer votre compte</h1>
      <p className="text-sm text-muted">14 jours d&apos;essai, sans carte bancaire, sans frais d&apos;onboarding.</p>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Nom complet"><Input name="full_name" required autoComplete="name" /></Field>
      <Field label="E-mail professionnel"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Field label="Mot de passe" hint="10 caractères minimum"><Input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
      <ErrorNote message={state?.error} />
      <Button className="w-full" disabled={pending}>{pending ? "Création…" : "Créer mon compte"}</Button>
      <p className="text-center text-sm text-muted">Déjà inscrit ? <Link className="text-brand underline" href="/login">Se connecter</Link></p>
    </form>
  );
}

export function MfaForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Double authentification</h1>
      <p className="text-sm text-muted">Saisissez le code à 6 chiffres de votre application d&apos;authentification.</p>
      <input type="hidden" name="next" value={next ?? ""} />
      <Input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus autoComplete="one-time-code" />
      <ErrorNote message={state?.error} />
      <Button className="w-full" disabled={pending}>Vérifier</Button>
    </form>
  );
}
