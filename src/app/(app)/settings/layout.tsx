import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <SettingsNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
