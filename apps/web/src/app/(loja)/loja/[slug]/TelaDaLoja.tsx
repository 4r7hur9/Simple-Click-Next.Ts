/**
 * A página pública de uma loja, com a janela do "Sobre" junto.
 *
 * As DUAS ROTAS desenham isto: `/loja/<loja>` com a janela fechada e
 * `/loja/<loja>/sobre` com ela aberta. Assim o link do Sobre continua
 * compartilhável e legível pelo buscador, e quem o abre cai na loja — fechar a
 * janela mostra o cardápio a um toque, sem recarregar nada.
 *
 * Componente de SERVIDOR: busca e desenha tudo antes do primeiro script. Mora
 * junto das rotas, e não em `features`, porque é quem fala com `server`.
 */
import { notFound } from "next/navigation";

import { contagemExataDeItens } from "../../../../features/loja/contagem-de-itens.ts";
import { PerfilDaLoja } from "../../../../features/loja/PerfilDaLoja.tsx";
import { prepararProduto } from "../../../../server/catalogo-na-tela.ts";
import { postsDoCatalogo } from "../../../../features/feed/social.ts";
import type { RecebimentoDaLoja } from "../../../../features/loja/SobreDaLoja.tsx";
import {
  DadosEstruturados,
  negocioDaLoja,
} from "../../../../lib/dados-estruturados.tsx";
import type { RascunhoDaVitrine } from "../../../../lib/rascunho-da-vitrine.ts";
import { enderecoDoSite } from "../../../../server/endereco-do-site.ts";
import { resultadoComRascunho } from "../../../../server/previa.ts";
import { buscarFechamento } from "../../../../server/fechamento.ts";
import { usuarioDoPedidoAtual } from "../../../../server/usuario-da-sessao.ts";
import {
  buscarResumoDoCatalogo,
  buscarVitrine,
} from "../../../../server/vitrine.ts";
import {
  lojasSeguidas,
  tokenDaSessao,
} from "../../../(explorar)/explorar/_dados.ts";

export async function TelaDaLoja({
  apelido,
  sobreAberto,
  rascunho = null,
}: {
  readonly apelido: string;
  readonly sobreAberto: boolean;
  /** Só na prévia da Aparência: o que o dono está editando, por cima da loja. */
  readonly rascunho?: RascunhoDaVitrine | null | undefined;
}) {
  // Em paralelo: o fechamento só alimenta a janela, e não pode atrasar a loja.
  // Os posts (catálogo, usuário e favoritas) também: se falharem, a loja
  // aparece sem a seção de posts, nunca quebrada.
  const [resultadoSalvo, fechamento, catalogo, usuario, favoritas] =
    await Promise.all([
      buscarVitrine(apelido),
      buscarFechamento(apelido),
      // Só os primeiros de cada seção (card #74): a loja de dez mil produtos
      // não baixa o catálogo inteiro para montar a vitrine do perfil.
      buscarResumoDoCatalogo(apelido, { porSecao: 12, totalMaximo: 48 }),
      usuarioDoPedidoAtual(),
      tokenDaSessao().then(lojasSeguidas),
    ]);

  const resultado = resultadoComRascunho(resultadoSalvo, rascunho);

  // Inexistente e suspensa caem no MESMO lugar, porque a API já as respondeu
  // igual (AC-402). Distinguir aqui desfaria o cuidado tomado lá.
  if (resultado.estado === "nao-encontrada") notFound();

  if (resultado.estado === "indisponivel") {
    // API fora do ar não é loja inexistente. Mandar para o 404 faria o dono
    // achar que a loja dele sumiu quando o problema é nosso.
    throw new Error(`vitrine indisponível: ${resultado.motivo}`);
  }

  const { loja, abertura, horario } = resultado.vitrine;

  // SÓ o que a janela mostra sai daqui. A resposta do fechamento traz a chave
  // PIX, e ela não vai para a página de quem está conhecendo a loja (AC-904).
  // Fechamento fora do ar não derruba a loja: a janela só fica sem pagamento.
  const recebimento: RecebimentoDaLoja | null =
    fechamento.estado === "encontrado"
      ? {
          formasDePagamento: fechamento.fechamento.formasDePagamento,
          entrega: fechamento.fechamento.entrega,
        }
      : null;

  // Card #49: os produtos são os posts da loja. Cada produto aparece uma vez,
  // só os à venda; a vitrine mostra até seis numa grade (card #129).
  const posts =
    catalogo.estado === "encontrado"
      ? postsDoCatalogo(catalogo.dados.secoes, loja)
      : [];

  return (
    <main className="sc-pagina-da-loja">
      {/*
        Os dados estruturados vão no CORPO, e não no `<head>`: o buscador lê os
        dois, e aqui o bloco fica ao lado do conteúdo que ele descreve — quem
        editar a apresentação vê o bloco na mesma tela e lembra dele.
      */}
      <DadosEstruturados
        dados={negocioDaLoja({ loja, enderecoDoSite: enderecoDoSite() })}
      />

      <PerfilDaLoja
        loja={loja}
        abertura={abertura}
        horario={horario ?? null}
        recebimento={recebimento}
        destaques={
          catalogo.estado === "encontrado"
            ? catalogo.dados.destaques.map((produto) =>
                prepararProduto(produto, loja.apelido),
              )
            : []
        }
        posts={posts}
        logado={usuario.papel !== "visitante"}
        favorita={favoritas.includes(loja.apelido)}
        sobreAberto={sobreAberto}
        contagemDeItens={
          catalogo.estado === "encontrado"
            ? contagemExataDeItens(catalogo.dados.secoes)
            : null
        }
      />
    </main>
  );
}
