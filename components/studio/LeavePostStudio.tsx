"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconArrowLeft } from "@tabler/icons-react";

/** "← Leave PostStudio": back to where the owner came from. Asks first
 * only when there are unsaved changes (`dirty`) — there's no editor yet,
 * so today it never asks. */
export function LeavePostStudio({ href, label, confirmText, dirty = false }: { href: string; label: string; confirmText: string; dirty?: boolean }) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (dirty && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10"
    >
      <IconArrowLeft size={15} aria-hidden />
      {label}
    </Link>
  );
}
