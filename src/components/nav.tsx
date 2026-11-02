"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const items = [
  { href: "/dashboard", label: "Tableau de bord", icon: "◧" },
  { href: "/inbox", label: "À traiter", icon: "✦", count: "inbox" },
  { href: "/tasks", label: "Relances & tâches", icon: "◷", count: "tasks" },
  { href: "/pipeline", label: "Pipeline", icon: "▥" },
  { href: "/contacts", label: "Contacts", icon: "◉" },
  { href: "/companies", label: "Entreprises", icon: "▣" },
  { href: "/quotes", label: "Devis", icon: "❏" },
  { href: "/invoices", label: "Factures", icon: "€" },
  { href: "/import", label: "Importer", icon: "⇪" },
  { href: "/settings", label: "Paramètres", icon: "⚙" },
] as const;

type Counts = { inbox: number; tasks: number };

export function AppNav({ counts }: { counts: Counts; role: string }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2" aria-label="Navigation principale">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        const n = "count" in it ? counts[it.count] : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", active ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-bg")}
          >
            <span aria-hidden className="w-4 text-center text-muted">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {n > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-brand-ink">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

const mobile = [
  { href: "/dashboard", label: "Accueil", icon: "◧" },
  { href: "/inbox", label: "À traiter", icon: "✦", count: "inbox" },
  { href: "/contacts", label: "Contacts", icon: "◉" },
  { href: "/pipeline", label: "Pipeline", icon: "▥" },
  { href: "/tasks", label: "Tâches", icon: "◷", count: "tasks" },
] as const;

export function MobileNav({ counts }: { counts: Counts }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel md:hidden" aria-label="Navigation mobile">
      {mobile.map((it) => {
        const active = path.startsWith(it.href);
        const n = "count" in it ? counts[it.count] : 0;
        return (
          <Link key={it.href} href={it.href} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-brand" : "text-muted")}>
            <span aria-hidden className="text-base">{it.icon}</span>
            {it.label}
            {n > 0 && <span className="absolute top-1 right-1/4 rounded-full bg-brand px-1 text-[10px] text-brand-ink">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
