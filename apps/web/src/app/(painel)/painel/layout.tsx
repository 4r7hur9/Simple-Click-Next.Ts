import type { ReactNode } from "react";

import { AvisoDeSuspensao } from "../../../features/config/AvisoDeSuspensao.tsx";
import { AvisosPendentes } from "../../../features/config/AvisosPendentes.tsx";
import { MenuDoPainel } from "../../../features/painel/MenuDoPainel.tsx";
import { exigirLojaDaPagina } from "../../../server/loja-da-pagina.ts";

/**
 * Casca do painel da loja.
 *
 * A loja vem da sessão (T-115): sem sessão a pessoa vai para a entrada, e
 * dono de mais de uma loja escolhe antes de ver o painel. A casca mostra só o
 * nome e o apelido da loja da própria sessão — o acesso a cada dado continua
 * decidido pela API, que confere o vínculo do dono em toda rota.
 *
 * A navegação é o menu lateral (`features/painel/MenuDoPainel.tsx`): completo
 * no computador, só ícones no tablet, gaveta e barra de atalhos no celular.
 */
export default async function LayoutDoPainel({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { loja, lojas } = await exigirLojaDaPagina();
  return (
    <div className="min-h-screen bg-[var(--cor-papel)] text-[var(--cor-tinta)] md:flex">
      <MenuDoPainel
        nomeDaLoja={loja.nome}
        apelidoDaLoja={loja.apelido}
        temOutrasLojas={lojas.length > 1}
      />
      {/* No celular, o espaço de baixo é da barra de atalhos. */}
      <main
        aria-label="Painel da loja"
        className="min-w-0 flex-1 pb-24 md:pb-0"
      >
        {/* A suspensão vem antes das pendências: com a loja fora do ar,
            é o que o dono precisa ler primeiro (AC-209). */}
        <AvisoDeSuspensao />
        <AvisosPendentes />
        {children}
      </main>
    </div>
  );
}
