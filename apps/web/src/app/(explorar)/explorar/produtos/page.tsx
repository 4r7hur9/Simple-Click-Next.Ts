import type { Metadata } from "next";

import {
  lerConsulta,
  type ParametrosDaPagina,
} from "../../../../features/feed/consulta.ts";
import { TelaDoFeed, type ConteudoDoFeed } from "../../../../features/feed/TelaDoFeed.tsx";
import { buscarTiposDeNegocio } from "../../../../server/feed.ts";
import { usuarioDoPedidoAtual } from "../../../../server/usuario-da-sessao.ts";
import * as acoes from "../acoes.ts";
import { secoesDoInicio } from "../_secoes.tsx";
import {
  conteudoDosProdutos,
  ouReserva,
  seguidasDaConta,
  tokenDaSessao,
} from "../_dados.ts";

export const metadata: Metadata = {
  title: "Explorar produtos e lojas | SimpleClick",
  description:
    "Descubra produtos, ofertas e lojas perto de você no SimpleClick.",
  alternates: { canonical: "/explorar/produtos" },
};

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
  const parametros = await searchParams;
  const consulta = { ...lerConsulta("produtos", parametros), pagina: 1 };
  const token = await tokenDaSessao();
  const [tipos, conteudo, usuario, seguidas] = await Promise.all([
    ouReserva(buscarTiposDeNegocio(), []),
    ouReserva<ConteudoDoFeed>(conteudoDosProdutos(consulta, token), {
      estado: "indisponivel",
    }),
    usuarioDoPedidoAtual(),
    ouReserva(seguidasDaConta(token), { apelidos: [], sessaoVencida: false }),
  ]);
  return (
    <TelaDoFeed
      consulta={consulta}
      tipos={tipos}
      conteudo={conteudo}
      logado={usuario.papel !== "visitante"}
      secoes={secoesDoInicio(consulta, parametros["destaques"], token, "/explorar/produtos")}
      seguidas={seguidas.apelidos}
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
