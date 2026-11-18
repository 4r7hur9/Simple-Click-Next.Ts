import type { Metadata } from "next";

import {
  lerConsulta,
  type ParametrosDaPagina,
} from "../../../../features/feed/consulta.ts";
import { TelaDoFeed, type ConteudoDoFeed } from "../../../../features/feed/TelaDoFeed.tsx";
import { buscarTiposDeNegocio } from "../../../../server/feed.ts";
import { usuarioDoPedidoAtual } from "../../../../server/usuario-da-sessao.ts";
import * as acoes from "../acoes.ts";
import { conteudoDasLojas, ouReserva, tokenDaSessao } from "../_dados.ts";

export const metadata: Metadata = {
  title: "Lojas para explorar | SimpleClick",
  description: "Veja as lojas do SimpleClick, as favoritas e as que você visitou.",
  alternates: { canonical: "/explorar/lojas" },
};

/**
 * As lojas do feed, uma por vez como post (card #49), com favoritas e vistas
 * há pouco para quem tem conta.
 */
export default async function PaginaDeLojasDoExplorar({
  searchParams,
}: {
  searchParams: Promise<ParametrosDaPagina>;
}) {
  // A rolagem infinita sempre começa da primeira página.
  const consulta = { ...lerConsulta("lojas", await searchParams), pagina: 1 };
  const token = await tokenDaSessao();
  const [tipos, conteudo, usuario] = await Promise.all([
    ouReserva(buscarTiposDeNegocio(), []),
    ouReserva<ConteudoDoFeed>(conteudoDasLojas(consulta, token), {
      estado: "indisponivel",
    }),
    usuarioDoPedidoAtual(),
  ]);
  return (
    <TelaDoFeed
      consulta={consulta}
      tipos={tipos}
      conteudo={conteudo}
      logado={usuario.papel !== "visitante"}
      acoes={{
        maisPosts: acoes.maisPosts,
        maisLojas: acoes.maisLojas,
        curtir: acoes.curtir,
        curtirLoja: acoes.curtirLoja,
        favoritarProduto: acoes.favoritarProduto,
        comentarios: acoes.comentarios,
        comentar: acoes.comentar,
      }}
    />
  );
}
