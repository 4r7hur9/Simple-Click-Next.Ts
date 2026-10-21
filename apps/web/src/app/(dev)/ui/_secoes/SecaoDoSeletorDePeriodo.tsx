"use client";

import { useState } from "react";
import { SeletorDePeriodo, descreverPeriodo, type PeriodoIso } from "@simpleclick/ui";

import { Secao } from "./SecaoDaVitrine.tsx";

/** Vitrine do seletor de período: valor livre e valor com limites e comparação. */
export function SecaoDoSeletorDePeriodo() {
  const [livre, setLivre] = useState<PeriodoIso>({
    inicio: "2026-10-12",
    fim: "2026-10-18",
  });
  const [limitado, setLimitado] = useState<PeriodoIso>({
    inicio: "2026-10-10",
    fim: "2026-10-16",
  });
  const [anterior, setAnterior] = useState<PeriodoIso | null>(null);

  return (
    <Secao
      descricao="Botão com o período atual; abre atalhos e calendário de intervalo (2 meses em tela larga, gaveta no celular). Teclado: setas, PageUp/PageDown, Enter, Esc."
      id="secao-seletor-de-periodo"
      titulo="Seletor de período"
    >
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-col gap-2">
          <SeletorDePeriodo value={livre} onChange={(v) => setLivre(v)} />
          <p className="text-sm">
            Livre: {livre.inicio} → {livre.fim}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <SeletorDePeriodo
            comparacao={anterior}
            max="2026-10-31"
            min="2026-08-15"
            permitirComparacao
            value={limitado}
            onChange={(v, comparacao) => {
              setLimitado(v);
              setAnterior(comparacao);
            }}
          />
          <p className="text-sm">
            Entre 15 ago e 31 out 2026 · {descreverPeriodo(limitado, "2026-10-16")}
            {anterior !== null && ` · vs ${anterior.inicio} → ${anterior.fim}`}
          </p>
        </div>
      </div>
    </Secao>
  );
}
