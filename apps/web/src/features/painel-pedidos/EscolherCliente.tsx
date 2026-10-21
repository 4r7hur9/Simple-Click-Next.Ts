"use client";

/**
 * Quem pede, no pedido do balcão: escolher um cliente que já está na lista da
 * loja. Digitar nome ou telefone filtra; sem digitar, aparecem os que
 * compraram por último — o cliente que liga é, quase sempre, um deles.
 *
 * A busca é a mesma da lista de clientes (`/api/painel/clientes?busca=`), com
 * um pequeno atraso para não perguntar a cada tecla.
 */
import { useEffect, useState } from "react";
import { Aviso, Carregando, IconeBuscar } from "@simpleclick/ui";

import {
  buscarClientes,
  escreverTelefone,
  type Buscar,
  type ClienteDaLista,
} from "../../lib/clientes-do-painel.ts";

/** Quantos clientes a lista mostra de uma vez, no balcão. */
const LIMITE_NA_TELA = 6;
const ATRASO_DA_BUSCA_MS = 250;

export interface EscolherClienteProps {
  readonly escolhido: ClienteDaLista | null;
  readonly aoEscolher: (cliente: ClienteDaLista | null) => void;
  readonly buscar?: Buscar | undefined;
  readonly erro?: string | undefined;
}

export function EscolherCliente({
  escolhido,
  aoEscolher,
  buscar = fetch,
  erro,
}: EscolherClienteProps) {
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<
    | { readonly tipo: "carregando" }
    | { readonly tipo: "erro" }
    | { readonly tipo: "ok"; readonly clientes: readonly ClienteDaLista[] }
  >({ tipo: "carregando" });

  useEffect(() => {
    if (escolhido !== null) return;
    let ativo = true;
    setResultado({ tipo: "carregando" });
    const espera = setTimeout(
      () => {
        void buscarClientes(termo, buscar).then((leitura) => {
          if (!ativo) return;
          setResultado(
            leitura.estado === "ok"
              ? { tipo: "ok", clientes: leitura.clientes }
              : { tipo: "erro" },
          );
        });
        // Sem texto (a lista de quem comprou por último) não há tecla a esperar.
      },
      termo === "" ? 0 : ATRASO_DA_BUSCA_MS,
    );
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [buscar, termo, escolhido]);

  if (escolhido !== null) {
    return (
      <div
        className="sc-manual__escolhido"
        data-cliente-escolhido={escolhido.id}
      >
        <div>
          <strong>{escolhido.nome}</strong>
          <span className="sc-manual__apoio">
            {escolhido.telefone
              ? escreverTelefone(escolhido.telefone)
              : "Sem telefone"}
            {escolhido.totalDePedidos > 0
              ? ` · ${escolhido.totalDePedidos} pedido${escolhido.totalDePedidos === 1 ? "" : "s"}`
              : " · ainda não pediu"}
          </span>
        </div>
        <button
          type="button"
          className="sc-botao sc-botao--secundaria sc-botao--pequeno"
          onClick={() => aoEscolher(null)}
        >
          Trocar cliente
        </button>
      </div>
    );
  }

  return (
    <div className="sc-manual__busca">
      <label className="grid gap-1">
        <span className="font-medium">Buscar cliente (nome ou telefone)</span>
        <span className="sc-manual__campo-busca">
          <IconeBuscar aria-hidden="true" />
          <input
            className="sc-campo__controle"
            type="search"
            inputMode="search"
            placeholder="Ex.: Ana ou 99999"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            aria-invalid={erro ? true : undefined}
          />
        </span>
      </label>
      {erro ? (
        <p className="sc-campo__erro" role="alert">
          {erro}
        </p>
      ) : null}
      {resultado.tipo === "carregando" ? (
        <Carregando rotulo="Buscando clientes…" />
      ) : resultado.tipo === "erro" ? (
        <Aviso tom="atencao">
          Não foi possível buscar os clientes agora. Use “Cliente novo” para
          lançar o pedido com nome e telefone.
        </Aviso>
      ) : resultado.clientes.length === 0 ? (
        <p className="sc-manual__apoio">
          {termo.trim() === ""
            ? "A loja ainda não tem clientes cadastrados. Use “Cliente novo”."
            : "Ninguém com esse nome ou telefone. Use “Cliente novo” para cadastrar."}
        </p>
      ) : (
        <ul className="sc-manual__clientes" aria-label="Clientes encontrados">
          {resultado.clientes.slice(0, LIMITE_NA_TELA).map((cliente) => (
            <li key={cliente.id}>
              <button
                type="button"
                className="sc-manual__cliente"
                data-cliente={cliente.id}
                onClick={() => aoEscolher(cliente)}
              >
                <strong>{cliente.nome}</strong>
                <span className="sc-manual__apoio">
                  {cliente.telefone
                    ? escreverTelefone(cliente.telefone)
                    : "Sem telefone"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
