import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-ink">≡</span> Fil
        </Link>
        <div className="rounded-2xl border border-line bg-panel p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
