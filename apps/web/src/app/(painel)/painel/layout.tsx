import type { ReactNode } from "react";

import { TelaDeAprovacaoDaLoja } from "./_aprovacao/TelaDeAprovacaoDaLoja.tsx";
import { AvisoDeSuspensao } from "../../../features/config/AvisoDeSuspensao.tsx";
import { AvisosPendentes } from "../../../features/config/AvisosPendentes.tsx";
import { MenuDoPainel } from "../../../features/painel/MenuDoPainel.tsx";
import { papelDoTutorialNoPainel } from "../../../features/tutorial/passos.ts";
import { Tutorial } from "../../../features/tutorial/Tutorial.tsx";
import { permissoesDaLoja } from "../../../lib/permissoes.ts";
import { sairPelaBarra } from "../../../server/actions/auth.ts";
import { exigirLojaDaPagina } from "../../../server/loja-da-pagina.ts";
import { tutorialJaVistoNestePedido } from "../../../server/tutorial-da-sessao.ts";
import { usuarioDoPedidoAtual } from "../../../server/usuario-da-sessao.ts";

/**
 * Casca do painel da loja.
 *
 * A loja vem da sessão (T-115): sem sessão a pessoa vai para a entrada, e
 * quem tem mais de uma loja escolhe antes de ver o painel. O papel da pessoa
 * NESTA loja (dono ou equipe) e as permissões dele vêm junto, e o menu mostra
 * só o que esse papel usa. O acesso a cada dado continua decidido pela API,
 * que confere o vínculo e a permissão em toda rota.
 *
 * A navegação é o menu lateral (`features/painel/MenuDoPainel.tsx`): todas as
 * funções à vista, em seções, completo no computador, só ícones no tablet,
 * gaveta e barra de atalhos no celular. As áreas só do dono têm a própria
 * guarda (`GuardaDoPainel`) no layout de cada uma.
 *
 * O tutorial de primeiro acesso (card #39) é o do papel nesta loja (dono ou
 * equipe) e abre sozinho só se a conta ainda não o viu nem pulou.
 */
export default async function LayoutDoPainel({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { loja, lojas, token } = await exigirLojaDaPagina();
  // Loja aguardando aprovação ou recusada (card #28): nada de funções de
  // venda, só a tela de análise.
  if (loja.situacao === "PENDING_APPROVAL" || loja.situacao === "REJECTED") {
    return <TelaDeAprovacaoDaLoja loja={loja} token={token} />;
  }
  const papelDoTutorial = papelDoTutorialNoPainel(loja.papel);
  const [usuario, tutorialVisto] = await Promise.all([
    usuarioDoPedidoAtual(),
    papelDoTutorial === null
      ? Promise.resolve(true)
      : tutorialJaVistoNestePedido(papelDoTutorial),
  ]);
  return (
    <div className="min-h-screen bg-[var(--cor-papel)] text-[var(--cor-tinta)] md:flex">
      <MenuDoPainel
        nomeDaLoja={loja.nome}
        apelidoDaLoja={loja.apelido}
        papel={loja.papel}
        permissoes={[...permissoesDaLoja(loja)]}
        temOutrasLojas={lojas.length > 1}
        pessoa={
          usuario.papel === "visitante"
            ? undefined
            : {
                nome: usuario.nome,
                email: usuario.email,
                iniciais: usuario.iniciais,
              }
        }
        sair={sairPelaBarra}
      />
      {/* Respiro de baixo: no celular, a barra de atalhos (~4.5rem) mais
          6rem livres acima dela; no computador, somado ao fim de cada tela,
          pelo menos 3rem até a borda. */}
      <main
        aria-label="Painel da loja"
        className="min-w-0 flex-1 pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-6"
      >
        {/* A suspensão vem antes das pendências: com a loja fora do ar,
            é o que o dono precisa ler primeiro (AC-209). */}
        <AvisoDeSuspensao />
        <AvisosPendentes />
        {children}
      </main>
      {papelDoTutorial !== null && (
        <Tutorial papel={papelDoTutorial} abrirSozinho={!tutorialVisto} />
      )}
    </div>
  );
}
