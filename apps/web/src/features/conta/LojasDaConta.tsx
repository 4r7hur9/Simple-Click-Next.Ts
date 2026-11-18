"use client";

/**
 * Favoritos da conta: lojas favoritas, produtos favoritos e lojas vistas
 * recentemente (cards #35 e #111). Cada item leva à loja ou ao produto; nos
 * favoritos dá para tirar a estrela.
 *
 * Tirar dos favoritos (AC-11103, AC-11130): o botão diz o item no nome
 * ("Tirar Camiseta dos favoritos"), mostra a espera e não aceita clique
 * duplo; o item só some quando a API confirma. Se falhar, o item fica e um
 * aviso diz o que fazer, com "Tentar de novo".
 */
import Link from "next/link";
import { useState } from "react";
import {
  AvisoFlutuante,
  Botao,
  IconeEstrela,
  IconeLoja,
  IconeProduto,
  Vazio,
} from "@simpleclick/ui";
import type { LojaDoFeed, ProdutoFavorito } from "@simpleclick/contracts";

import { escreverDinheiro } from "../../lib/produto.ts";
import { chamarConta } from "./chamar-conta.ts";

/** A saída de todo vazio dos favoritos: sem nada guardado, o próximo passo é explorar. */
function ExplorarLojas() {
  return (
    <Link className="sc-botao sc-botao--primaria" href="/explorar">
      Explorar lojas
    </Link>
  );
}

function onde(loja: LojaDoFeed): string {
  return [loja.bairro, loja.cidade].filter(Boolean).join(" · ");
}

/** A remoção de um item: quem está sendo removido, e o aviso se falhar. */
function useRemocao<T>(
  inicial: readonly T[],
  chave: (item: T) => string,
  caminho: (item: T) => string,
) {
  const [itens, setItens] = useState(inicial);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [falhou, setFalhou] = useState<T | null>(null);

  async function remover(item: T) {
    if (removendo !== null) return;
    setFalhou(null);
    setRemovendo(chave(item));
    const r = await chamarConta("DELETE", caminho(item));
    setRemovendo(null);
    if (r.ok)
      setItens((atuais) => atuais.filter((x) => chave(x) !== chave(item)));
    else setFalhou(item);
  }

  return {
    itens,
    removendo,
    falhou,
    remover,
    limparFalha: () => setFalhou(null),
  };
}

function AvisoDeFalha<T>({
  falhou,
  aoTentar,
  aoFechar,
}: {
  readonly falhou: T | null;
  readonly aoTentar: (item: T) => void;
  readonly aoFechar: () => void;
}) {
  return (
    <AvisoFlutuante
      tom="erro"
      mensagem={
        falhou === null
          ? null
          : "Não foi possível remover agora. O item continua nos favoritos."
      }
      acao={
        falhou === null
          ? undefined
          : { rotulo: "Tentar de novo", aoAcionar: () => aoTentar(falhou) }
      }
      aoFechar={aoFechar}
    />
  );
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
  const {
    itens: lojas,
    removendo,
    falhou,
    remover,
    limparFalha,
  } = useRemocao(
    inicial,
    (l: LojaDoFeed) => l.apelido,
    (l) => `favoritos/${encodeURIComponent(l.apelido)}`,
  );

  if (lojas.length === 0)
    return (
      <Vazio
        titulo={vazio.titulo}
        descricao={vazio.descricao}
        acao={<ExplorarLojas />}
      />
    );

  return (
    <>
      <ul className="sc-lojas-conta">
        {lojas.map((loja) => (
          <li
            key={loja.apelido}
            className="sc-lojas-conta__item"
            data-loja={loja.apelido}
          >
            <Link
              className="sc-lojas-conta__link"
              href={`/loja/${loja.apelido}`}
            >
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
                carregando={removendo === loja.apelido}
                rotuloDeEspera="Tirando dos favoritos…"
                desabilitado={removendo !== null}
                onClick={() => void remover(loja)}
              >
                {`Tirar ${loja.nome} dos favoritos`}
              </Botao>
            ) : null}
          </li>
        ))}
      </ul>
      <AvisoDeFalha
        falhou={falhou}
        aoTentar={(l) => void remover(l)}
        aoFechar={limparFalha}
      />
    </>
  );
}

/** Os produtos favoritos: foto, nome, preço, loja, link e "Tirar dos favoritos". */
export function ListaDeProdutosFavoritos({
  produtos: inicial,
}: {
  readonly produtos: readonly ProdutoFavorito[];
}) {
  const {
    itens: produtos,
    removendo,
    falhou,
    remover,
    limparFalha,
  } = useRemocao(
    inicial,
    (p: ProdutoFavorito) => p.id,
    (p) => `favoritos/produtos/${encodeURIComponent(p.id)}`,
  );

  if (produtos.length === 0) {
    return (
      <Vazio
        titulo="Nenhum produto favorito ainda"
        descricao="Toque na estrela de um produto no Explorar e ele aparece aqui."
        acao={<ExplorarLojas />}
      />
    );
  }

  return (
    <>
      <ul className="sc-produtos-conta">
        {produtos.map((p) => (
          <li
            key={p.id}
            className="sc-produtos-conta__item"
            data-produto={p.id}
          >
            <Link
              className="sc-produtos-conta__link"
              href={`/loja/${encodeURIComponent(p.loja.apelido)}/produto/${encodeURIComponent(p.id)}`}
            >
              <span className="sc-produtos-conta__foto" aria-hidden="true">
                {p.imagem ? (
                  <img src={p.imagem} alt="" loading="lazy" />
                ) : (
                  <IconeProduto />
                )}
              </span>
              <span className="sc-produtos-conta__texto">
                <span className="sc-lojas-conta__nome">{p.nome}</span>
                <span className="sc-lojas-conta__meta">{p.loja.nome}</span>
                <span className="sc-produtos-conta__preco">
                  {p.precoCentavos === null
                    ? "Preço na loja"
                    : escreverDinheiro(p.precoCentavos)}
                  {p.disponivel ? null : " · indisponível"}
                </span>
              </span>
            </Link>
            <Botao
              variante="discreta"
              tamanho="pequeno"
              icone={<IconeEstrela preenchido />}
              carregando={removendo === p.id}
              rotuloDeEspera="Tirando dos favoritos…"
              desabilitado={removendo !== null}
              onClick={() => void remover(p)}
            >
              {`Tirar ${p.nome} dos favoritos`}
            </Botao>
          </li>
        ))}
      </ul>
      <AvisoDeFalha
        falhou={falhou}
        aoTentar={(p) => void remover(p)}
        aoFechar={limparFalha}
      />
    </>
  );
}
