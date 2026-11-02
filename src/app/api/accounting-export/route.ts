import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { getContext } from "@/lib/context";

/** FACT-02 : export comptable — journal des ventes (une ligne par taux de TVA et par facture). */
export async function GET(req: NextRequest) {
  const { supabase, org } = await getContext();
  const from = req.nextUrl.searchParams.get("from") ?? "1970-01-01";
  const to = req.nextUrl.searchParams.get("to") ?? "2999-12-31";
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, number, issue_date, due_date, currency, status, customer, invoice_lines(quantity, unit_price, tax_rate)")
    .eq("org_id", org.id)
    .neq("status", "draft")
    .gte("issue_date", from)
    .lte("issue_date", to)
    .order("number");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows: (string | number)[][] = [["Journal", "Date", "N° pièce", "Client", "SIREN client", "Taux TVA", "Montant HT", "Montant TVA", "Montant TTC", "Devise", "Échéance", "Statut"]];
  for (const inv of invoices ?? []) {
    const byRate = new Map<number, number>();
    for (const l of inv.invoice_lines as { quantity: number; unit_price: number; tax_rate: number }[]) {
      byRate.set(Number(l.tax_rate), (byRate.get(Number(l.tax_rate)) ?? 0) + Number(l.quantity) * Number(l.unit_price));
    }
    const c = inv.customer as Record<string, string>;
    for (const [rate, ht] of byRate) {
      const tva = Math.round(ht * rate) / 100;
      rows.push(["VE", inv.issue_date, inv.number, c.company_name ?? c.contact_name ?? "", c.siren ?? "", rate, ht.toFixed(2), tva.toFixed(2), (ht + tva).toFixed(2), inv.currency, inv.due_date, inv.status]);
    }
  }
  const csv = "﻿" + Papa.unparse(rows, { delimiter: ";" });
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="journal-ventes-${from}-${to}.csv"` },
  });
}
