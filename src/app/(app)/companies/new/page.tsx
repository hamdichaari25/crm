import { createCompany } from "@/app/(app)/_actions/contacts";
import { CompanyFields } from "@/components/forms/company-fields";
import { Button, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Nouvelle entreprise" };

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader title="Nouvelle entreprise" />
      <Card className="max-w-2xl">
        <form action={createCompany} className="space-y-4">
          <CompanyFields />
          <Button>Créer</Button>
        </form>
      </Card>
    </>
  );
}
