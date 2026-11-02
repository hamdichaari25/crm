import { NewContactForm } from "@/components/forms/contact-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Nouveau contact" };

export default async function NewContactPage({ searchParams }: PageProps<"/contacts/new">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return (
    <>
      <PageHeader title="Nouveau contact" subtitle="Les doublons sur l'e-mail et le téléphone sont détectés avant l'enregistrement." />
      <Card className="max-w-2xl">
        <NewContactForm defaults={{ email: str("email"), phone: str("phone"), first_name: str("name"), inbox_item_id: str("inbox") }} />
      </Card>
    </>
  );
}
