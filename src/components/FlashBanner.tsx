"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

/** Shows the message a server action left in the flash cookie; `flash` is "<stamp>|<message>" so a repeat shows again. */
export function FlashBanner({ flash }: { flash: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    document.cookie = "va_flash=; path=/; max-age=0";
    setMsg(flash.slice(flash.indexOf("|") + 1));
  }, [flash]);
  if (!msg) return null;
  return (
    <div role="alert" className="fixed left-1/2 top-4 z-50 flex w-[min(560px,calc(100%-32px))] -translate-x-1/2 items-start gap-3 rounded-xl border border-[#F3B8B0] bg-high-bg px-4 py-3 text-sm text-high-fg shadow-lg">
      <span className="flex-1">{msg}</span>
      <button onClick={() => setMsg(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/60">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
