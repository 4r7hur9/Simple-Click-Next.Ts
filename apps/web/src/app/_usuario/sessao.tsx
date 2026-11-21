/**
 * As peças do usuário montadas com a sessão deste pedido (card #22).
 *
 * Moram em `app/` porque é quem pode falar com `server/`: leem a pessoa da
 * sessão no servidor (a página chega com o nome certo, sem piscar) e entregam
 * aos componentes de `features/usuario/`, que só recebem propriedades, junto
 * com a ação de sair.
 *
 * - `NavegacaoDaSessao` e `BarraInferiorDaSessao` (card #105): o topo e a barra
 *   inferior do cliente, na loja, no explorar e na conta. Em cada moldura o
 *   topo vem antes do conteúdo e a barra depois (a ordem do Tab).
 * - O tutorial do cliente (card #39) vem junto do topo: ele está em toda
 *   página do cliente e o menu da conta é onde fica "Ver tutorial".
 * - O modal "Minha conta" (card #151) também: quem tem sessão o abre pelo
 *   avatar ou pelo "Perfil", em qualquer uma dessas telas. Só o e-mail da
 *   conta e as ações de sair seguem para o navegador; os dados do modal são
 *   lidos lá, ao abrir.
 * - `UsuarioDoMenuDaSessao`: o pé do menu lateral do painel e da
 *   administração.
 */
import { Suspense } from "react";

import { ModalDaConta } from "../../features/conta/ModalDaConta.tsx";
import { Tutorial } from "../../features/tutorial/Tutorial.tsx";
import { BarraInferiorDoCliente } from "../../features/usuario/BarraInferiorDoCliente.tsx";
import { LocalizacaoDoTopo } from "../../features/usuario/LocalizacaoDoTopo.tsx";
import { SacolaDoTopo } from "../../features/usuario/SacolaDoTopo.tsx";
import { TopoDoCliente } from "../../features/usuario/TopoDoCliente.tsx";
import { UsuarioNoMenu } from "../../features/usuario/UsuarioNoMenu.tsx";
import type { LojaNaBarra } from "../../lib/quem-esta-logado.ts";
import { cidadeDoPedidoAtual } from "../../server/cidade-do-topo.ts";
import {
  encerrarTodasAsSessoes,
  sairDaConta,
  sairPelaBarra,
} from "../../server/actions/auth.ts";
import { sairDepoisDeExcluirAConta } from "../../server/actions/conta.ts";
import { tutorialJaVistoNestePedido } from "../../server/tutorial-da-sessao.ts";
import { usuarioDoPedidoAtual } from "../../server/usuario-da-sessao.ts";

/**
 * O topo do cliente com a sessão deste pedido. O papel vem SÓ da sessão lida
 * aqui no servidor. A cidade do endereço padrão só é lida para o cliente (e
 * só cidade e UF seguem para o navegador); a sacola só existe dentro de uma
 * loja; o tutorial do cliente continua montado junto.
 *
 * `lerLojaDeOrigem` (card #135) lê a loja de onde o cliente veio, conferida
 * na API: fora da loja, o menu da conta oferece "Voltar à loja" para ela. Só
 * o cliente tem esse item, então a leitura SÓ acontece para o cliente (card
 * #137) — dono, equipe e visitante não pagam a ida à API — e corre em
 * paralelo com a cidade e o tutorial, depois de a sessão dizer o papel.
 */
export async function NavegacaoDaSessao({
  loja,
  lerLojaDeOrigem,
}: {
  readonly loja?: LojaNaBarra | undefined;
  readonly lerLojaDeOrigem?: (() => Promise<LojaNaBarra | undefined>) | undefined;
}) {
  const usuario = await usuarioDoPedidoAtual();
  const cliente = usuario.papel === "cliente";
  const [cidade, jaViu, lojaDeOrigem] = await Promise.all([
    cliente ? cidadeDoPedidoAtual() : Promise.resolve(null),
    cliente ? tutorialJaVistoNestePedido("cliente") : Promise.resolve(true),
    cliente && lerLojaDeOrigem !== undefined
      ? lerLojaDeOrigem()
      : Promise.resolve(undefined),
  ]);
  return (
    <>
      <TopoDoCliente
        usuario={usuario}
        loja={loja}
        lojaDeOrigem={lojaDeOrigem}
        sair={sairPelaBarra}
        localizacao={<LocalizacaoDoTopo cidade={cidade} />}
        sacola={loja === undefined ? undefined : <SacolaDoTopo apelido={loja.apelido} />}
      />
      {usuario.papel !== "visitante" && (
        // `useSearchParams` do modal pede o `Suspense` (como o topo faz).
        <Suspense fallback={null}>
          <ModalDaConta
            key={usuario.email}
            email={usuario.email}
            acoes={{ sairDaConta, encerrarTodasAsSessoes, sairDepoisDeExcluirAConta }}
          />
        </Suspense>
      )}
      {cliente && <Tutorial papel="cliente" abrirSozinho={!jaViu} />}
    </>
  );
}

/** A barra inferior do celular (a pergunta da sessão é uma só por pedido). */
export async function BarraInferiorDaSessao() {
  return <BarraInferiorDoCliente usuario={await usuarioDoPedidoAtual()} />;
}

export async function UsuarioDoMenuDaSessao() {
  const usuario = await usuarioDoPedidoAtual();
  return <UsuarioNoMenu usuario={usuario} sair={sairPelaBarra} />;
}
