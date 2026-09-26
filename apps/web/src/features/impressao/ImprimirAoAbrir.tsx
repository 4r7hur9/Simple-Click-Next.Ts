"use client";

import { useEffect } from "react";

/**
 * Abre a janela de impressão do navegador assim que o cupom está na tela
 * (T-606 — AC-617).
 *
 * É o "um clique, sem instalar nada": o dono clica em imprimir no pedido, esta
 * página abre, e o diálogo de impressão do próprio navegador aparece com o
 * cupom no tamanho do papel. Nenhum programa além do navegador.
 *
 * Espera as fontes carregarem antes de chamar a impressão: com a fonte ainda
 * chegando, o navegador imprimiria com a de reserva, e a coluna de valores
 * poderia sair noutro lugar do que se vê na tela.
 */
export function ImprimirAoAbrir() {
  useEffect(() => {
    let desistiu = false;
    const fontesProntas =
      typeof document.fonts === "undefined"
        ? Promise.resolve()
        : document.fonts.ready.then(() => undefined);
    void fontesProntas.then(() => {
      // O modo estrito monta, desmonta e monta de novo em desenvolvimento: sem
      // esta guarda, o diálogo abriria duas vezes.
      if (!desistiu) window.print();
    });
    return () => {
      desistiu = true;
    };
  }, []);

  return null;
}
