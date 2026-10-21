/**
 * As peças do usuário montadas com a sessão deste pedido (card #22).
 *
 * Moram em `app/` porque é quem pode falar com `server/`: leem a pessoa da
 * sessão no servidor (a página chega com o nome certo, sem piscar) e entregam
 * aos componentes de `features/usuario/`, que só recebem propriedades, junto
 * com a ação de sair.
 *
 * - `LateralDaSessao`: a lateral flutuante da loja e da Minha conta.
 * - O tutorial do cliente (card #39) vem junto da lateral: ela está em toda
 *   página do cliente (loja, explorar, conta) e é onde fica "Ver tutorial".
 * - `UsuarioDoMenuDaSessao`: o pé do menu lateral do painel e da
 *   administração (lá a lateral flutuante não entra, para não duplicar menu).
 */
import { Tutorial } from "../../features/tutorial/Tutorial.tsx";
import { LateralDoUsuario } from "../../features/usuario/LateralDoUsuario.tsx";
import { UsuarioNoMenu } from "../../features/usuario/UsuarioNoMenu.tsx";
import type { LojaNaBarra } from "../../lib/quem-esta-logado.ts";
import { sairPelaBarra } from "../../server/actions/auth.ts";
import { tutorialJaVistoNestePedido } from "../../server/tutorial-da-sessao.ts";
import { usuarioDoPedidoAtual } from "../../server/usuario-da-sessao.ts";

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
