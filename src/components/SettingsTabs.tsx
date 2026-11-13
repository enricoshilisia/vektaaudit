"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "./ui";

export function SettingsTabs({ admin }: { admin: boolean }) {
  const path = usePathname();
  const tabs = [
    { key: "team", label: "Team", href: "/settings/team" },
    ...(admin
      ? [
          { key: "organisation", label: "Organisation", href: "/settings/organisation" },
          { key: "microsoft", label: "Microsoft 365", href: "/settings/microsoft" },
          { key: "retention", label: "Retention", href: "/settings/retention" },
          { key: "api", label: "API", href: "/settings/api" },
        ]
      : []),
    { key: "profile", label: "Your profile", href: "/settings/profile" },
  ];
  return (
    <div className="border-b border-line">
      <Tabs tabs={tabs} active={path.split("/")[2] ?? "team"} />
    </div>
  );
}
