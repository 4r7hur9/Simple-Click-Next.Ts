"use client";

import { IconeBuscar, IconeFechar } from "@simpleclick/ui";
import { useEffect, useId, useState } from "react";

import {
  EMOJIS_DA_CASA,
  ETIQUETAS_DA_CASA,
  textoDoPreco,
  type ModeloDeEtiqueta,
  type ProdutoMarcado,
} from "./documento.ts";

type Aba = "emojis" | "etiquetas" | "produto";

export type BuscarProdutos = (busca: string) => Promise<readonly ProdutoMarcado[]>;

/** Os produtos publicados da loja, pela lista paginada do painel. */
export const buscarProdutosDoPainel: BuscarProdutos = async (busca) => {
  const consulta = new URLSearchParams({ porPagina: "12", situacao: "publicado" });
  if (busca.trim() !== "") consulta.set("busca", busca.trim());
  const resposta = await fetch(`/api/catalogo/produtos?${consulta.toString()}`, {
    cache: "no-store",
  });
  if (!resposta.ok) throw new Error("falha");
  const corpo = (await resposta.json()) as {
    produtos?: readonly { id: string; nome: string }[];
  };
  return (corpo.produtos ?? []).map((produto) => ({
    id: produto.id,
    nome: produto.nome,
  }));
};

interface Props {
  readonly corDestaque: string;
  readonly tintaDaDestaque: string;
  readonly buscarProdutos?: BuscarProdutos;
  readonly aoEscolherEmoji: (emoji: string) => void;
  readonly aoEscolherEtiqueta: (
    modelo: Pick<ModeloDeEtiqueta, "texto" | "fundo" | "tinta">,
    produto: ProdutoMarcado | null,
  ) => void;
  readonly aoFechar: () => void;
}

function limitarNome(nome: string): string {
  return nome.length > 26 ? `${nome.slice(0, 25).trimEnd()}…` : nome;
}

export function BandejaDeAdesivos({
  corDestaque,
  tintaDaDestaque,
  buscarProdutos = buscarProdutosDoPainel,
  aoEscolherEmoji,
  aoEscolherEtiqueta,
  aoFechar,
}: Props) {
  const [aba, setAba] = useState<Aba>("emojis");
  const [preco, setPreco] = useState("");
  const [busca, setBusca] = useState("");
  const [produtos, setProdutos] = useState<readonly ProdutoMarcado[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const idDoPreco = useId();
  const idDaBusca = useId();
  const textoDeEtiqueta = textoDoPreco(preco);

  useEffect(() => {
    if (aba !== "produto") return;
    let valendo = true;
    setFalhou(false);
    const espera = window.setTimeout(() => {
      buscarProdutos(busca)
        .then((lista) => valendo && setProdutos(lista))
        .catch(() => {
          if (valendo) {
            setFalhou(true);
            setProdutos([]);
          }
        });
    }, busca === "" ? 0 : 300);
    return () => {
      valendo = false;
      window.clearTimeout(espera);
    };
  }, [aba, busca, buscarProdutos]);

  return (
    <div className="sc-story-bandeja" role="group" aria-label="Adesivos">
      <div className="sc-story-bandeja__topo">
        <div className="sc-story-linha" role="tablist" aria-label="Tipos de adesivo">
          {(
            [
              ["emojis", "Emojis"],
              ["etiquetas", "Etiquetas"],
              ["produto", "Produto"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="sc-story-chip"
              aria-selected={aba === id}
              aria-pressed={aba === id}
              onClick={() => setAba(id)}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sc-story-icone"
          aria-label="Fechar os adesivos"
          onClick={aoFechar}
        >
          <IconeFechar aria-hidden="true" />
        </button>
      </div>

      {aba === "emojis" ? (
        <ul className="sc-story-emojis">
          {EMOJIS_DA_CASA.map((emoji) => (
            <li key={emoji}>
              <button
                type="button"
                className="sc-story-emojis__item"
                aria-label={`Adicionar ${emoji}`}
                onClick={() => aoEscolherEmoji(emoji)}
              >
                {emoji}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {aba === "etiquetas" ? (
        <div className="sc-story-etiquetas">
          <ul className="sc-story-etiquetas__lista">
            {ETIQUETAS_DA_CASA.map((modelo) => (
              <li key={modelo.id}>
                <button
                  type="button"
                  className="sc-story-etiquetas__item"
                  style={{ background: modelo.fundo, color: modelo.tinta }}
                  onClick={() => aoEscolherEtiqueta(modelo, null)}
                >
                  {modelo.texto}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="sc-story-preco"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (textoDeEtiqueta === null) return;
              aoEscolherEtiqueta(
                { texto: textoDeEtiqueta, fundo: corDestaque, tinta: tintaDaDestaque },
                null,
              );
              setPreco("");
            }}
          >
            <label htmlFor={idDoPreco}>Preço (R$)</label>
            <input
              id={idDoPreco}
              className="sc-story-campo"
              inputMode="decimal"
              autoComplete="off"
              placeholder="19,90"
              value={preco}
              onChange={(evento) => setPreco(evento.target.value)}
            />
            <button
              type="submit"
              className="sc-story-botao sc-story-botao--destaque"
              disabled={textoDeEtiqueta === null}
            >
              Adicionar {textoDeEtiqueta ?? "preço"}
            </button>
          </form>
        </div>
      ) : null}

      {aba === "produto" ? (
        <div className="sc-story-produtos">
          <p className="sc-story-produtos__texto">
            Marque um produto da loja: o nome aparece no story e o botão do story passa a
            levar direto para ele.
          </p>
          <label className="sc-story-produtos__busca" htmlFor={idDaBusca}>
            <IconeBuscar aria-hidden="true" />
            <span className="sc-story-oculto">Buscar produto</span>
            <input
              id={idDaBusca}
              className="sc-story-campo"
              type="search"
              placeholder="Buscar produto"
              autoComplete="off"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
            />
          </label>
          {produtos === null ? (
            <p role="status" className="sc-story-produtos__texto">
              Buscando produtos…
            </p>
          ) : falhou ? (
            <p role="alert" className="sc-story-produtos__texto">
              Não foi possível carregar os produtos agora.
            </p>
          ) : produtos.length === 0 ? (
            <p role="status" className="sc-story-produtos__texto">
              Nenhum produto publicado encontrado.
            </p>
          ) : (
            <ul className="sc-story-produtos__lista">
              {produtos.map((produto) => (
                <li key={produto.id}>
                  <button
                    type="button"
                    className="sc-story-produtos__item"
                    onClick={() =>
                      aoEscolherEtiqueta(
                        {
                          texto: limitarNome(produto.nome),
                          fundo: corDestaque,
                          tinta: tintaDaDestaque,
                        },
                        produto,
                      )
                    }
                  >
                    {produto.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
