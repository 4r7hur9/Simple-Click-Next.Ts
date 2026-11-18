/**
 * As peças do usuário montadas com a sessão deste pedido (card #22).
 *
 * Moram em `app/` porque é quem pode falar com `server/`: leem a pessoa da
 * sessão no servidor (a página chega com o nome certo, sem piscar) e entregam
 * aos componentes de `features/usuario/`, que só recebem propriedades, junto
 * com a ação de sair.
 *
 * - `NavegacaoDaSessao` e `BarraInferiorDaSessao` (card #105): o topo e a barra
 *   inferior do cliente, que substituíram a lateral na loja, no explorar e na
 *   conta. Em cada moldura o topo vem antes do conteúdo e a barra depois (a
 *   ordem do Tab).
 * - `LateralDaSessao`: a lateral flutuante (fora das molduras do cliente desde
 *   o #105; a remoção é do #111).
 * - O tutorial do cliente (card #39) vem junto da lateral: ela está em toda
 *   página do cliente (loja, explorar, conta) e é onde fica "Ver tutorial".
 * - `UsuarioDoMenuDaSessao`: o pé do menu lateral do painel e da
 *   administração (lá a lateral flutuante não entra, para não duplicar menu).
 */
import { Tutorial } from "../../features/tutorial/Tutorial.tsx";
import { BarraInferiorDoCliente } from "../../features/usuario/BarraInferiorDoCliente.tsx";
import { LocalizacaoDoTopo } from "../../features/usuario/LocalizacaoDoTopo.tsx";
import { SacolaDoTopo } from "../../features/usuario/SacolaDoTopo.tsx";
import { TopoDoCliente } from "../../features/usuario/TopoDoCliente.tsx";
import { LateralDoUsuario } from "../../features/usuario/LateralDoUsuario.tsx";
import { UsuarioNoMenu } from "../../features/usuario/UsuarioNoMenu.tsx";
import type { LojaNaBarra } from "../../lib/quem-esta-logado.ts";
import { cidadeDoPedidoAtual } from "../../server/cidade-do-topo.ts";
import { sairPelaBarra } from "../../server/actions/auth.ts";
import { tutorialJaVistoNestePedido } from "../../server/tutorial-da-sessao.ts";
import { usuarioDoPedidoAtual } from "../../server/usuario-da-sessao.ts";

/**
 * O topo do cliente com a sessão deste pedido. O papel vem SÓ da sessão lida
 * aqui no servidor. A cidade do endereço padrão só é lida para o cliente (e
 * só cidade e UF seguem para o navegador); a sacola só existe dentro de uma
 * loja; o tutorial do cliente continua montado junto.
 */
export async function NavegacaoDaSessao({
  loja,
}: {
  readonly loja?: LojaNaBarra | undefined;
}) {
  const usuario = await usuarioDoPedidoAtual();
  const cliente = usuario.papel === "cliente";
  const [cidade, jaViu] = await Promise.all([
    cliente ? cidadeDoPedidoAtual() : Promise.resolve(null),
    cliente ? tutorialJaVistoNestePedido("cliente") : Promise.resolve(true),
  ]);
  return (
    <>
      <TopoDoCliente
        usuario={usuario}
        loja={loja}
        sair={sairPelaBarra}
        localizacao={<LocalizacaoDoTopo cidade={cidade} />}
        sacola={loja === undefined ? undefined : <SacolaDoTopo apelido={loja.apelido} />}
      />
      {cliente && <Tutorial papel="cliente" abrirSozinho={!jaViu} />}
    </>
  );
}

/** A barra inferior do celular (a pergunta da sessão é uma só por pedido). */
export async function BarraInferiorDaSessao() {
  return <BarraInferiorDoCliente usuario={await usuarioDoPedidoAtual()} />;
}

export async function LateralDaSessao({
  loja,
}: {
  readonly loja?: LojaNaBarra | undefined;
}) {
  const usuario = await usuarioDoPedidoAtual();
  const cliente = usuario.papel === "cliente";
  const jaViu = cliente ? await tutorialJaVistoNestePedido("cliente") : true;
  return (
    <>
      <LateralDoUsuario usuario={usuario} loja={loja} sair={sairPelaBarra} />
      {cliente && <Tutorial papel="cliente" abrirSozinho={!jaViu} />}
    </>
  );
}

export async function UsuarioDoMenuDaSessao() {
  const usuario = await usuarioDoPedidoAtual();
  return <UsuarioNoMenu usuario={usuario} sair={sairPelaBarra} />;
}
