import type { Metadata } from "next";

import {
  lerConsulta,
  type ParametrosDaPagina,
} from "../../../features/feed/consulta.ts";
import { TelaDoFeed, type ConteudoDoFeed } from "../../../features/feed/TelaDoFeed.tsx";
import { buscarTiposDeNegocio } from "../../../server/feed.ts";
import { usuarioDoPedidoAtual } from "../../../server/usuario-da-sessao.ts";
import * as acoes from "./acoes.ts";
import { secoesDoInicio } from "./_secoes.tsx";
import {
  conteudoDosProdutos,
  ouReserva,
  seguidasDaConta,
  tokenDaSessao,
} from "./_dados.ts";

export const metadata: Metadata = {
  title: "Explorar | SimpleClick",
  description:
    "Stories, lojas perto de você, destaques e publicações das lojas do SimpleClick.",
  alternates: { canonical: "/explorar" },
};

/**
 * A vitrine mista (card #152): os stories das lojas, as lojas perto da
 * região escolhida, os destaques de produtos e o feed de posts, nessa ordem.
 * Só monta o que as telas do feed já sabem desenhar, com as leituras que já
 * existem. Cada seção carrega e falha sozinha.
 */
export default async function PaginaDoExplorar({
  searchParams,
}: {
  searchParams: Promise<ParametrosDaPagina>;
}) {
  const parametros = await searchParams;
  // O endereço só traz a região e o tipo de negócio; busca e filtros levam à
  // lista de produtos. A rolagem infinita sempre começa da primeira página.
  const consulta = {
    ...lerConsulta("produtos", {
      tipo: parametros["tipo"],
      lat: parametros["lat"],
      lng: parametros["lng"],
    }),
    inicio: true,
    pagina: 1,
  };
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
      secoes={secoesDoInicio(consulta, parametros["destaques"], token, "/explorar")}
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
