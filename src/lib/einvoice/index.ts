import "server-only";

/**
 * Couche d'abstraction « plateforme agréée » (PA) pour la facturation électronique française.
 * Le partenaire n'est pas encore choisi (question ouverte du PRD) : un connecteur « bac à sable »
 * simule le cycle de vie (dépôt → reçue → payée) pour développer et tester le parcours B.
 * Un vrai connecteur implémente la même interface et remonte les statuts via
 * POST /api/einvoice/{orgId} (voir README).
 */
export type EInvoicePayload = {
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  seller: { name: string; siren?: string | null; vatNumber?: string | null; address?: string | null };
  buyer: Record<string, unknown>;
  lines: { description: string; quantity: number; unitPrice: number; taxRate: number }[];
  totals: { subtotal: number; tax: number; total: number };
};

export type TransmitResult = { platformRef: string; status: string; message?: string };

export interface EInvoiceProvider {
  id: string;
  label: string;
  transmit(invoice: EInvoicePayload): Promise<TransmitResult>;
}

const sandbox: EInvoiceProvider = {
  id: "sandbox",
  label: "Bac à sable (simulation)",
  async transmit(invoice) {
    const missing: string[] = [];
    if (!invoice.seller.siren) missing.push("SIREN du vendeur");
    if (!invoice.buyer["company_name"]) missing.push("raison sociale du client");
    if (invoice.lines.length === 0) missing.push("au moins une ligne");
    if (missing.length) {
      return { platformRef: `SBX-${invoice.number}`, status: "rejected", message: `Données obligatoires manquantes : ${missing.join(", ")}` };
    }
    return { platformRef: `SBX-${invoice.number}-${Date.now().toString(36)}`, status: "deposited", message: "Facture déposée sur la plateforme (simulation)" };
  },
};

const providers: Record<string, EInvoiceProvider> = { sandbox };

export function getEInvoiceProvider(id?: string | null): EInvoiceProvider {
  return providers[id ?? "sandbox"] ?? sandbox;
}

export function listEInvoiceProviders() {
  return Object.values(providers).map((p) => ({ id: p.id, label: p.label }));
}
