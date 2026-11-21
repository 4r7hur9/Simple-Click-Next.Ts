import { redirect } from "next/navigation";

import { ListaDeLojas, ListaDeProdutosFavoritos } from "../../../../features/conta/LojasDaConta.tsx";
import { Erro } from "@simpleclick/ui";
import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";
import { buscarFavoritos, buscarRecentes } from "../../../../lib/conta-do-cliente.ts";
import { tokenOuEntrar } from "../_token.ts";
import { comDestino } from "../../../../lib/destino-seguro.ts";

export const metadata = { title: "Favoritos | SimpleClick" };
export const dynamic = "force-dynamic";

/** Lojas favoritas e vistas recentemente. */
export default async function PaginaDeFavoritos() {
  const token = await tokenOuEntrar("/conta/favoritos");
  const [favoritos, recentes] = await Promise.all([buscarFavoritos(token), buscarRecentes(token)]);
  if (favoritos.estado === "nao-autenticado") redirect(comDestino("/entrar", "/conta/favoritos"));

  return (
    <PaginaDaConta
      titulo="Favoritos"
      descricao="As lojas e os produtos que você marcou, e as lojas que visitou há pouco, para voltar com um toque."
    >
      {favoritos.estado === "indisponivel" ? (
        <Erro
          titulo="Não deu para carregar os favoritos"
          mensagem="Houve uma falha ao buscar o que você marcou. Nada foi apagado."
          acao={<a className="sc-botao sc-botao--secundaria" href="/conta/favoritos">Tentar de novo</a>}
        />
      ) : null}
      <div className="sc-minha-conta__blocos">
        <section aria-labelledby="fav-produtos">
          <h2 id="fav-produtos" className="sc-inicio__titulo">Produtos favoritos</h2>
          <ListaDeProdutosFavoritos produtos={favoritos.estado === "ok" ? favoritos.dados.produtos : []} />
        </section>
        <section aria-labelledby="fav-favoritas">
          <h2 id="fav-favoritas" className="sc-inicio__titulo">Lojas favoritas</h2>
          <ListaDeLojas
            removivel
            lojas={favoritos.estado === "ok" ? favoritos.dados.lojas : []}
            vazio={{
              titulo: "Nenhuma loja favorita ainda",
              descricao: "Marque uma loja como favorita ao explorar e ela aparece aqui.",
            }}
          />
        </section>
        <section aria-labelledby="fav-recentes">
          <h2 id="fav-recentes" className="sc-inicio__titulo">Vistas recentemente</h2>
          <p className="sc-minha-conta__descricao">Lojas que você abriu nos últimos 30 dias. Não são favoritas.</p>
          <ListaDeLojas
            lojas={recentes.estado === "ok" ? recentes.dados : []}
            vazio={{
              titulo: "Nada visto por aqui",
              descricao: "As lojas que você abrir ficam guardadas aqui por um tempo.",
            }}
          />
        </section>
      </div>
    </PaginaDaConta>
  );
}
