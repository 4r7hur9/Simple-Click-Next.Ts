import type { Metadata } from "next";

import {
  lerConsulta,
  type ParametrosDaPagina,
} from "../../../../features/feed/consulta.ts";
import { TelaDoFeed } from "../../../../features/feed/TelaDoFeed.tsx";
import { buscarTiposDeNegocio } from "../../../../server/feed.ts";
import { usuarioDoPedidoAtual } from "../../../../server/usuario-da-sessao.ts";
import * as acoes from "../acoes.ts";
import { conteudoDosProdutos, lojasSeguidas, storiesDoFeed, tokenDaSessao } from "../_dados.ts";

export const metadata: Metadata = { title: "Explorar produtos | SimpleClick" };

/**
 * A aba padrão do feed: os produtos que as lojas publicaram, como posts de
 * rede social (card #49), com os stories das lojas no topo.
 */
export default async function PaginaDeProdutosDoExplorar({
  searchParams,
}: {
  searchParams: Promise<ParametrosDaPagina>;
}) {
  // A rolagem infinita sempre começa da primeira página.
  const consulta = { ...lerConsulta("produtos", await searchParams), pagina: 1 };
  const token = await tokenDaSessao();
  const [tipos, conteudo, usuario, stories, seguidas] = await Promise.all([
    buscarTiposDeNegocio(),
    conteudoDosProdutos(consulta),
    usuarioDoPedidoAtual(),
    storiesDoFeed(token),
    lojasSeguidas(token),
  ]);
  return (
    <TelaDoFeed
      consulta={consulta}
      tipos={tipos}
      conteudo={conteudo}
      logado={usuario.papel !== "visitante"}
      stories={stories}
      seguidas={seguidas}
      acoes={{
        maisPosts: acoes.maisPosts,
        maisLojas: acoes.maisLojas,
        curtir: acoes.curtir,
        curtirLoja: acoes.curtirLoja,
        favoritarProduto: acoes.favoritarProduto,
        comentarios: acoes.comentarios,
        comentar: acoes.comentar,
        storyVisto: acoes.storyVisto,
      }}
    />
  );
}
