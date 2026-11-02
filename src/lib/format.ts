export const CURRENCIES = ["EUR", "MAD", "XOF", "XAF", "DZD", "TND"] as const;

export function money(amount: number | string | null | undefined, currency = "EUR") {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Horodatage de la requête (rendu serveur). */
export function nowMs() {
  return Date.now();
}

export function date(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

export function relative(d: string | Date | null | undefined) {
  if (!d) return "—";
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return date(d);
}

export function fullName(c: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null | undefined) {
  if (!c) return "—";
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return n || c.email || c.phone || "Sans nom";
}

export const ACTIVITY_LABELS: Record<string, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  call: "Appel",
  meeting: "Rendez-vous",
  note: "Note",
  stage_change: "Étape",
  quote: "Devis",
  invoice: "Facture",
  system: "Système",
};

export const QUOTE_STATUS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  invoiced: "Facturé",
};

export const INVOICE_STATUS: Record<string, string> = {
  draft: "Brouillon",
  issued: "Émise",
  transmitted: "Transmise",
  delivered: "Reçue par le client",
  rejected: "Rejetée",
  paid: "Payée",
  cancelled: "Annulée",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  manager: "Responsable commercial",
  sales: "Commercial",
  finance: "Administratif / finance",
};
