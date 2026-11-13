import { SettingsTabs } from "@/components/SettingsTabs";
import { PageHeader } from "@/components/ui";
import { can, requireUser } from "@/lib/server/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs admin={can(s, "admin")} />
      {children}
    </>
  );
}
