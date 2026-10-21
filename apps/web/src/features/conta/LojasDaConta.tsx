"use client";

/**
 * Lojas favoritas e vistas recentemente (card #35). Cada loja leva à vitrine;
 * nos favoritos, dá para tirar a estrela.
 */
import Link from "next/link";
import { useState } from "react";
import { Botao, IconeEstrela, IconeLoja, IconeProduto, Vazio } from "@simpleclick/ui";
import type { LojaDoFeed, ProdutoFavorito } from "@simpleclick/contracts";

import { escreverDinheiro } from "../../lib/produto.ts";
import { chamarConta } from "./chamar-conta.ts";

function onde(loja: LojaDoFeed): string {
  return [loja.bairro, loja.cidade].filter(Boolean).join(" · ");
}

export function ListaDeLojas({
  lojas: inicial,
  removivel = false,
  vazio,
}: {
  readonly lojas: readonly LojaDoFeed[];
  readonly removivel?: boolean;
  readonly vazio: { readonly titulo: string; readonly descricao: string };
}) {
  const [lojas, setLojas] = useState(inicial);
  const [falhou, setFalhou] = useState(false);

  async function remover(apelido: string) {
    setFalhou(false);
    const r = await chamarConta("DELETE", `favoritos/${apelido}`);
    if (r.ok) setLojas((l) => l.filter((x) => x.apelido !== apelido));
    else setFalhou(true);
  }

  if (lojas.length === 0) return <Vazio titulo={vazio.titulo} descricao={vazio.descricao} />;

  return (
    <>
      {falhou ? <p role="alert">Não foi possível remover agora. Tente de novo.</p> : null}
      <ul className="sc-lojas-conta">
        {lojas.map((loja) => (
          <li key={loja.apelido} className="sc-lojas-conta__item" data-loja={loja.apelido}>
            <Link className="sc-lojas-conta__link" href={`/loja/${loja.apelido}`}>
              <span className="sc-lojas-conta__icone" aria-hidden="true">
                <IconeLoja />
              </span>
              <span>
                <span className="sc-lojas-conta__nome">{loja.nome}</span>
                <span className="sc-lojas-conta__meta">
                  {loja.tipoDeNegocioNome}
                  {onde(loja) === "" ? "" : ` · ${onde(loja)}`}
                </span>
              </span>
            </Link>
            {removivel ? (
              <Botao
                variante="discreta"
                tamanho="pequeno"
                icone={<IconeEstrela preenchido />}
                onClick={() => void remover(loja.apelido)}
              >
                Tirar dos favoritos
              </Botao>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Os produtos favoritos: foto, nome, preço, loja, link e "Tirar dos favoritos". */
export function ListaDeProdutosFavoritos({
  produtos: inicial,
}: {
  readonly produtos: readonly ProdutoFavorito[];
}) {
  const [produtos, setProdutos] = useState(inicial);
  const [falhou, setFalhou] = useState(false);

  async function remover(id: string) {
    setFalhou(false);
    const r = await chamarConta("DELETE", `favoritos/produtos/${id}`);
    if (r.ok) setProdutos((p) => p.filter((x) => x.id !== id));
    else setFalhou(true);
  }

  if (produtos.length === 0) {
    return (
      <Vazio
        titulo="Nenhum produto favorito ainda"
        descricao="Toque na estrela de um produto no Explorar e ele aparece aqui."
      />
    );
  }

  return (
    <>
      {falhou ? <p role="alert">Não foi possível remover agora. Tente de novo.</p> : null}
      <ul className="sc-produtos-conta">
        {produtos.map((p) => (
          <li key={p.id} className="sc-produtos-conta__item" data-produto={p.id}>
            <Link
              className="sc-produtos-conta__link"
              href={`/loja/${encodeURIComponent(p.loja.apelido)}/produto/${encodeURIComponent(p.id)}`}
            >
              <span className="sc-produtos-conta__foto" aria-hidden="true">
                {p.imagem ? <img src={p.imagem} alt="" loading="lazy" /> : <IconeProduto />}
              </span>
              <span className="sc-produtos-conta__texto">
                <span className="sc-lojas-conta__nome">{p.nome}</span>
                <span className="sc-lojas-conta__meta">{p.loja.nome}</span>
                <span className="sc-produtos-conta__preco">
                  {p.precoCentavos === null ? "Preço na loja" : escreverDinheiro(p.precoCentavos)}
                  {p.disponivel ? null : " · indisponível"}
                </span>
              </span>
            </Link>
            <Botao
              variante="discreta"
              tamanho="pequeno"
              icone={<IconeEstrela preenchido />}
              onClick={() => void remover(p.id)}
            >
              Tirar dos favoritos
            </Botao>
          </li>
        ))}
      </ul>
    </>
  );
}
