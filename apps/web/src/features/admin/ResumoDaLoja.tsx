"use client";

/**
 * A aba "Resumo" da ficha da loja (card #29): os números, quem tem acesso e
 * os limites. O cadastro, os documentos, as funcionalidades e o histórico
 * moram nas outras abas.
 */

import { LimitesDaLoja } from "./LimitesDaLoja.tsx";
import { EquipeDaLoja } from "./EquipeDaLoja.tsx";
import { MetricasDaLoja } from "./MetricasDaLoja.tsx";

export function ResumoDaLoja({ lojaId }: { readonly lojaId: string }) {
  return (
    <div className="grid gap-8">
      <MetricasDaLoja lojaId={lojaId} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <EquipeDaLoja lojaId={lojaId} />
        <LimitesDaLoja lojaId={lojaId} />
      </div>
    </div>
  );
}
