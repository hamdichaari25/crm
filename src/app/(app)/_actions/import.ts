"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";

export type ImportRow = Record<string, string | Record<string, string>>;
export type ChunkResult = { inserted: number; duplicates: number; updated: number; failed: number; errors: { row: number; level: string; reason: string }[] };

export async function importChunk(rows: ImportRow[], mode: "skip" | "merge", offset: number): Promise<ChunkResult> {
  const { supabase, org } = await getContext();
  if (rows.length > 1000) throw new Error("Lot trop grand");
  const { data, error } = await supabase.rpc("import_contacts", { p_org: org.id, p_rows: rows, p_mode: mode, p_offset: offset });
  if (error) throw new Error(error.message);
  return data as ChunkResult;
}

export async function saveImportJob(filename: string, total: number, result: ChunkResult) {
  const { supabase, org, user } = await getContext();
  await supabase.from("import_jobs").insert({
    org_id: org.id,
    filename,
    total_rows: total,
    inserted: result.inserted,
    duplicates: result.duplicates,
    failed: result.failed,
    report: result.errors.slice(0, 2000),
    created_by: user.id,
  });
  revalidatePath("/contacts");
  revalidatePath("/import");
}
