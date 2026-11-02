import { SignupForm } from "@/components/forms/auth-forms";

export const metadata = { title: "Créer un compte" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  return <SignupForm next={typeof next === "string" ? next : undefined} />;
}
