"use client";

// The upgrade promos' real data for the current page (plan, facts, strip
// state), from lib/upgradePromos.server.ts via DashboardShell. Without a
// provider nothing promotes anything.

import { createContext, useContext, type ReactNode } from "react";
import type { UpgradeContextData } from "@/lib/upgradePromos.server";

const UpgradeCtx = createContext<UpgradeContextData | null>(null);

export function UpgradeProvider({ value, children }: { value: UpgradeContextData | null; children: ReactNode }) {
  return <UpgradeCtx.Provider value={value}>{children}</UpgradeCtx.Provider>;
}

export function useUpgrade(): UpgradeContextData | null {
  return useContext(UpgradeCtx);
}
