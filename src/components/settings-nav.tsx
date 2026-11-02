"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const links = [
  ["/settings", "Organisation"],
  ["/settings/team", "Équipe et rôles"],
  ["/settings/pipelines", "Pipelines"],
  ["/settings/automations", "Automatisations"],
  ["/settings/channels", "Canaux et intégrations"],
  ["/settings/products", "Catalogue produits"],
  ["/settings/security", "Sécurité"],
  ["/settings/data", "Données et RGPD"],
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Paramètres">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm", path === href ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-panel")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
