import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Fil — le CRM qui se remplit tout seul", template: "%s · Fil" },
  description: "CRM conversationnel pour PME B2B : e-mail, téléphone, WhatsApp, du devis à la facture.",
  applicationName: "Fil CRM",
  appleWebApp: { capable: true, title: "Fil" },
};

export const viewport: Viewport = { themeColor: "#0f6e5a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
