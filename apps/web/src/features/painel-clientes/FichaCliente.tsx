"use client";

/**
 * A ficha do cliente: dados, correção, remoção e histórico (AC-705, AC-711).
 *
 * REMOVER PEDE CONFIRMAÇÃO NA PRÓPRIA TELA, e não numa janela do navegador:
 * o botão vira a pergunta, com o que acontece dito com todas as letras — a
 * ficha sai das listas, os pedidos ficam. O dono decide sabendo.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Carregando, Erro, Sucesso } from "@simpleclick/ui";

import {
  buscarFicha,
  corrigirCliente,
  escreverTelefone,
  removerCliente,
  type Buscar,
  type FichaComHistorico,
  type FichaDoCliente,
} from "../../lib/clientes-do-painel.ts";
import { FormularioCliente } from "./FormularioCliente.tsx";
import { HistoricoCliente } from "./HistoricoCliente.tsx";

type Estado =
  | { readonly tipo: "carregando" }
  | { readonly tipo: "erro" }
  | { readonly tipo: "nao-encontrado" }
  | { readonly tipo: "removido" }
  | { readonly tipo: "ok"; readonly ficha: FichaComHistorico };

export interface FichaClienteProps {
  readonly clienteId: string;
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: Buscar | undefined;
}

export function FichaCliente({ clienteId, buscar = fetch }: FichaClienteProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [editando, setEditando] = useState(false);
  const [salvou, setSalvou] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [remocaoFalhou, setRemocaoFalhou] = useState(false);

  const carregar = useCallback(async () => {
    setEstado({ tipo: "carregando" });
    const leitura = await buscarFicha(clienteId, buscar);
    if (leitura.estado === "ok")
      setEstado({ tipo: "ok", ficha: leitura.ficha });
    else if (leitura.estado === "nao-encontrado") {
      setEstado({ tipo: "nao-encontrado" });
    } else setEstado({ tipo: "erro" });
  }, [buscar, clienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function depoisDaCorrecao(ficha: FichaDoCliente) {
    setEditando(false);
    setSalvou(true);
    setEstado((atual) =>
      atual.tipo === "ok"
        ? { tipo: "ok", ficha: { ...atual.ficha, cliente: ficha } }
        : atual,
    );
  }

  async function remover() {
    setRemovendo(true);
    setRemocaoFalhou(false);
    const removido = await removerCliente(clienteId, buscar);
    setRemovendo(false);
    if (removido) setEstado({ tipo: "removido" });
    else setRemocaoFalhou(true);
  }

  const voltar = (
    <Link
      className="sc-botao sc-botao--discreta sc-botao--pequeno justify-self-start"
      href="/painel/clientes"
    >
      ← Voltar para os clientes
    </Link>
  );

  if (estado.tipo === "carregando") {
    return <Carregando rotulo="Carregando ficha do cliente…" />;
  }
  if (estado.tipo === "erro") {
    return (
      <Erro
        titulo="Não foi possível abrir esta ficha"
        mensagem="Confira a conexão e tente de novo."
        acao={
          <Botao variante="secundaria" onClick={() => void carregar()}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }
  if (estado.tipo === "nao-encontrado") {
    return (
      <Erro
        titulo="Cliente não encontrado"
        mensagem="Ele pode ter sido removido — ou não é cliente desta loja."
        acao={voltar}
      />
    );
  }
  if (estado.tipo === "removido") {
    return (
      <Sucesso
        titulo="Cliente removido das listas"
        descricao="Os pedidos dele continuam na loja, com os dados de cada compra."
        acao={voltar}
      />
    );
  }

  const { cliente, pedidos } = estado.ficha;

  return (
    <div className="grid gap-8">
      {voltar}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-tinta-suave)]">
            Ficha do cliente
          </p>
          <h1 className="mt-2 text-4xl font-semibold">{cliente.nome}</h1>
          <p className="mt-2 text-lg text-[var(--cor-tinta-suave)]">
            {escreverTelefone(cliente.telefone)}
            {cliente.email ? ` · ${cliente.email}` : ""}
            {cliente.temConta ? " · Tem conta na plataforma" : ""}
          </p>
          {cliente.observacao ? (
            <p className="mt-2">{cliente.observacao}</p>
          ) : null}
        </div>
        <Link
          className="sc-botao sc-botao--primaria"
          href={`/painel/pedidos/novo?cliente=${encodeURIComponent(cliente.id)}`}
        >
          Novo pedido para {cliente.nome}
        </Link>
      </header>

      {salvou ? <Aviso tom="sucesso">Ficha corrigida.</Aviso> : null}

      <div className="flex flex-wrap gap-3">
        <Botao variante="secundaria" onClick={() => setEditando((a) => !a)}>
          {editando ? "Fechar correção" : "Corrigir dados"}
        </Botao>
        {confirmandoRemocao ? (
          <div
            className="flex flex-wrap items-center gap-3"
            role="group"
            aria-label="Confirmar remoção"
          >
            <span>
              Remover tira {cliente.nome} das listas. Os pedidos ficam.
            </span>
            <Botao
              variante="perigo"
              carregando={removendo}
              rotuloDeEspera="Removendo…"
              onClick={() => void remover()}
            >
              Sim, remover
            </Botao>
            <Botao
              variante="discreta"
              onClick={() => setConfirmandoRemocao(false)}
            >
              Não remover
            </Botao>
          </div>
        ) : (
          <Botao
            variante="discreta"
            onClick={() => setConfirmandoRemocao(true)}
          >
            Remover cliente
          </Botao>
        )}
      </div>
      {remocaoFalhou ? (
        <Aviso tom="erro">Não foi possível remover agora. Tente de novo.</Aviso>
      ) : null}

      {editando ? (
        <FormularioCliente
          titulo="Corrigir dados do cliente"
          inicial={cliente}
          enviar={(dados) => corrigirCliente(cliente.id, dados, buscar)}
          aoSalvar={depoisDaCorrecao}
        />
      ) : null}

      <HistoricoCliente clienteId={cliente.id} pedidos={pedidos} />
    </div>
  );
}
