import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import Papa from "papaparse";
import { getContext } from "@/lib/context";

/** ADM-01 : export complet dans un format ouvert (CSV dans une archive ZIP). */
const TABLES = [
  "companies", "contacts", "pipelines", "stages", "deals", "activities", "tasks", "products",
  "quotes", "quote_lines", "invoices", "invoice_lines", "invoice_events", "ai_suggestions", "automation_rules", "audit_log",
] as const;

export async function GET() {
  const { supabase, org, role } = await getContext();
  if (role !== "admin") return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });

  const files: Record<string, Uint8Array> = {};
  for (const t of TABLES) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(t).select("*").eq("org_id", org.id).range(from, from + 999);
      if (error) return NextResponse.json({ error: `${t}: ${error.message}` }, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
    files[`${t}.csv`] = strToU8("﻿" + Papa.unparse(flat, { delimiter: ";" }));
  }
  files["LISEZMOI.txt"] = strToU8(`Export complet — ${org.name}\nGénéré le ${new Date().toISOString()}\nUn fichier CSV (UTF-8, séparateur ;) par table. Les colonnes JSON sont sérialisées.\n`);

  const zip = zipSync(files, { level: 6 });
  return new NextResponse(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="export-fil-${new Date().toISOString().slice(0, 10)}.zip"` },
  });
}
