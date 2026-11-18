"use client";

/**
 * Produto não encontrado numa loja que existe (card #132, achado A7 do #114).
 *
 * Antes caía no "Esta loja não está disponível" da loja, que manda a pessoa
 * embora de uma loja que funciona. Aqui o assunto é o PRODUTO, e a saída é o
 * catálogo da própria loja. A moldura da loja (topo, rodapé) continua em volta.
 *
 * O `not-found` não recebe os parâmetros da rota: o apelido vem de
 * `useParams`, só para montar o link de volta. Sem apelido (não deveria
 * acontecer), a saída é a descoberta.
 */
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProdutoNaoEncontrado() {
  const parametros = useParams<{ slug?: string }>();
  const apelido =
    typeof parametros?.slug === "string" ? parametros.slug : undefined;
  const destino = apelido
    ? `/loja/${encodeURIComponent(apelido)}/cardapio`
    : "/explorar";

  return (
    <main className="sc-pagina-da-loja">
      <section className="sc-secao">
        <div className="sc-secao__conteudo">
          <h1 className="sc-secao__titulo">Produto não encontrado</h1>
          <p className="sc-secao__texto">
            Este produto não está mais no catálogo, ou o link chegou incompleto.
            Os outros produtos da loja continuam à sua espera.
          </p>
          <p>
            <Link
              href={destino}
              className="sc-botao sc-botao--primaria sc-botao--pilula"
            >
              {apelido ? "Ver o catálogo da loja" : "Explorar lojas"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
