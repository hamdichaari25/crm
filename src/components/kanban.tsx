"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { moveDeal } from "@/app/(app)/_actions/deals";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";

export type KanbanStage = { id: string; name: string; position: number; probability: number; kind: "open" | "won" | "lost" };
export type KanbanDeal = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  stage_id: string;
  position: number;
  expected_close_date: string | null;
  contact: { id: string; first_name: string | null; last_name: string | null } | null;
  company: string | null;
};

export function Kanban({ pipelineId, stages, deals: initial }: { pipelineId: string; stages: KanbanStage[]; deals: KanbanDeal[] }) {
  const [deals, setDeals] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  // Resynchronise après un rafraîchissement serveur (pattern « état dérivé des props »)
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setDeals(initial);
  }

  // Changement visible par toute l'équipe en temps réel
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`deals-${pipelineId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `pipeline_id=eq.${pipelineId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pipelineId, router]);

  const byStage = useMemo(() => {
    const m = new Map<string, KanbanDeal[]>();
    for (const s of stages) m.set(s.id, []);
    for (const d of deals) m.get(d.stage_id)?.push(d);
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [deals, stages]);

  function drop(stageId: string, beforeId: string | null, id: string | null = dragging) {
    setDragging(null);
    setOver(null);
    if (!id) return;
    const list = (byStage.get(stageId) ?? []).filter((d) => d.id !== id);
    const idx = beforeId ? list.findIndex((d) => d.id === beforeId) : list.length;
    const prev = list[idx - 1]?.position ?? (list[0]?.position ?? 1000) - 1000;
    const next = list[idx]?.position ?? prev + 2000;
    const position = (prev + next) / 2;
    const before = deals;
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, stage_id: stageId, position } : d)));
    start(async () => {
      try {
        await moveDeal(id, stageId, position);
      } catch (e) {
        setDeals(before);
        setError((e as Error).message);
      }
    });
  }

  // Accessibilité / mobile : déplacement par liste déroulante
  function moveTo(id: string, stageId: string) {
    drop(stageId, null, id);
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((s) => {
          const list = byStage.get(s.id) ?? [];
          const sum = list.reduce((a, d) => a + d.amount, 0);
          return (
            <section
              key={s.id}
              aria-label={s.name}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(s.id, null);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl border bg-panel/60 ${over === s.id ? "border-brand" : "border-line"}`}
            >
              <header className="border-b border-line px-3 py-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className={s.kind === "won" ? "text-brand" : s.kind === "lost" ? "text-danger" : ""}>{s.name}</span>
                  <span className="text-xs font-normal text-muted">{list.length}</span>
                </div>
                <p className="text-xs text-muted tabular-nums">{money(sum, list[0]?.currency ?? "EUR")} · {s.probability} %</p>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {list.map((d) => (
                  <li
                    key={d.id}
                    draggable
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      drop(s.id, d.id);
                    }}
                    className={`cursor-grab rounded-lg border border-line bg-panel p-2.5 text-sm shadow-sm active:cursor-grabbing ${dragging === d.id ? "opacity-50" : ""}`}
                  >
                    <Link href={`/deals/${d.id}`} className="block font-medium hover:underline">{d.title}</Link>
                    <p className="text-xs text-muted">{[d.company, d.contact && [d.contact.first_name, d.contact.last_name].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="tabular-nums">{money(d.amount, d.currency)}</span>
                      <select
                        aria-label={`Déplacer ${d.title}`}
                        value={d.stage_id}
                        onChange={(e) => moveTo(d.id, e.target.value)}
                        className="max-w-28 rounded border border-line bg-panel text-xs text-muted"
                      >
                        {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
