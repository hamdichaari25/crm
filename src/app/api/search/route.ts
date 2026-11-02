import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const org = req.nextUrl.searchParams.get("org");
  if (!org || q.trim().length < 2) return NextResponse.json([]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", { p_org: org, p_q: q.slice(0, 100), p_limit: 6 });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
