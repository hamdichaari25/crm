"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Hit = { kind: "contact" | "company" | "deal"; id: string; title: string; subtitle: string | null };
const HREF = { contact: "/contacts/", company: "/companies/", deal: "/deals/" };
const LABEL = { contact: "Contact", company: "Entreprise", deal: "Opportunité" };

export function GlobalSearch({ orgId }: { orgId: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&org=${orgId}`, { signal: ctrl.signal }).catch(() => null);
      if (res?.ok) setHits(await res.json());
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, orgId]);

  const shown = q.trim().length >= 2 ? hits : [];

  return (
    <div className="relative flex-1 max-w-xl">
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Rechercher un contact, une entreprise, une opportunité…  (Ctrl K)"
        aria-label="Recherche globale"
        className="w-full rounded-lg border border-line bg-panel px-3 py-1.5 text-sm placeholder:text-muted focus:border-brand focus:outline-none"
      />
      {open && shown.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 max-h-96 overflow-auto rounded-xl border border-line bg-panel py-1 shadow-lg">
          {shown.map((h) => (
            <li key={h.kind + h.id}>
              <Link href={HREF[h.kind] + h.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg">
                <span className="w-20 shrink-0 text-xs text-muted">{LABEL[h.kind]}</span>
                <span className="truncate font-medium">{h.title}</span>
                {h.subtitle && <span className="truncate text-xs text-muted">{h.subtitle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
