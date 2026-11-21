"use client";

/**
 * Monta os filhos em toda rota, MENOS na exibição de TV (ver `rota-da-tv.ts`).
 * Serve ao aviso de cookies e à janela de acesso, que dependem de toque.
 */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ehRotaDaTv } from "./rota-da-tv.ts";

export function ForaDaTv({ children }: { readonly children: ReactNode }) {
  if (ehRotaDaTv(usePathname())) return null;
  return <>{children}</>;
}
